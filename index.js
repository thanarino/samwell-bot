let express = require("express");
let request = require("request-promise");
let bodyParser = require("body-parser");
let mongoose = require('mongoose');
let recastai = require('recastai').default;
let moment = require('moment');

let db = mongoose.connect(process.env.MONGODB_URI);
let Student = require('./models/students');
let Section = require('./models/sections');
let Conversationid = require('./models/conversations');

const client = new recastai(process.env.REQUEST_TOKEN);
const build = client.build;

let { isTyping, sendMessage, sendQuickReply } = require('./exports/common');
let { checkID } = require('./exports/signup');

// const WIT_TOKEN = process.env.WIT_TOKEN;
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
const FB_APP_SECRET = process.env.FB_APP_SECRET;

const sessions = {};

const findOrCreateSession = (fbid) => {
    let sessionId;
    Object.keys(sessions).forEach(k => {
        if (sessions[k].fbid === fbid) {
            sessionId = k;
        }
    });
    if (!sessionId) {
        sessionId = new Date().toISOString();
        sessions[sessionId] = { fbid: fbid, context: {} };
    }
    return sessionId;
};

let app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 5000));

// Server index page
app.get("/", (req, res) => {
    res.send("Deployed!");
});

// Facebook Webhook
// Used for verification
app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFICATION_TOKEN) {
        console.log("Verified webhook");
        res.status(200).send(req.query["hub.challenge"]);
    } else {
        console.error("Verification failed. The tokens do not match.");
        res.sendStatus(403);
    }
});

// All callbacks for Messenger will be POST-ed here
app.post("/webhook", (req, res) => {
    // Make sure this is a page subscription
    if (req.body.object == "page") {
        // Iterate over each entry
        // There may be multiple entries if batched
        req.body.entry.forEach((entry) => {
            // Iterate over each messaging event
            entry.messaging.forEach((event) => {
                Conversationid.findOne({ fbid: event.sender.id }, function (err, obj) {
                    if (!obj) {
                        Conversationid.create({ fbid: event.sender.id, conversationid: Math.floor((Math.random() * 1000000) + 1)})
                    }
                })
                if (event.postback) {
                    processPostback(event);
                } else if (event.message && !event.message.is_echo) {
                    const { text, attachments } = event.message;

                    if (attachments) {
                        sendMessage(event.sender.id, { text: 'Sorry, I can only understand text messages for now.' })
                            .catch(console.error);
                    } else if (text) {
                        client.request.analyseText(text).then((res) => {
                            analyzeEntities(event.sender.id, res, text);
                        })
                            .catch((err) => {
                                sendMessage(event.sender.id, {
                                        text: 'Oops, we got an error from Recast.ai, our magic Human Understandinator(tm). Please try again.'
                                    }).catch(console.error);
                                console.log(err.stack || err);
                                Conversationid.update({ fbid: sender }, { $set: { conversationid: undefined } });
                                // conversationID = undefined;
                        }) 
                    } else {
                        console.log('recieved event', JSON.stringify(event));
                    }
                }
            });
        });

        res.sendStatus(200);
    }
});

app.post("/verify-class", (req, res) => {
    let received = req.body;

    let section = received.conversation.memory.section.value.toUpperCase().replace(/ /g, '');
    let subject = received.conversation.memory.subject.value.toUpperCase().replace(/ /g, '');

    let found = Section.findOne({ sectionName: section, subject: subject }, function (err, obj) {
        if (obj) {
            let toSend = Object.assign({}, {
                replies: [
                    {
                        type: 'text',
                        content: 'Your teacher should have provided a code to enter this section. What is it?'
                    },
                    {
                        type: 'text',
                        content: 'Section found!!'
                    }
                ]
            }, {
                conversation: {
                    memory: Object.assign({}, received.conversation.memory, {
                        code: {
                            raw: obj.code,
                            value: obj.code
                        }
                    })
                }
            });
            res.send(toSend);
        } else {
            let toSend = Object.assign({}, {
                replies: [{
                    type: 'text',
                    content: "I can't seem to find the class. Can you repeat your request?"
                }],
            }, { conversation: { memory: {}} });
            res.send(toSend);
        }
    });
});

app.post("/verify-code", (req, res) => {
    let received = req.body;

    let section = received.conversation.memory.section.value.toUpperCase().replace(/ /g, '');
    let subject = received.conversation.memory.subject.value.toUpperCase().replace(/ /g, '');

    let code = received.conversation.memory.code.raw;
    let inputCode = received.conversation.memory.inputCode.raw;

    Conversationid.findOne({ conversationid: req.conversation.id }, (err, obj) => {
        Section.findOne({ sectionName: section, subject: subject, studentList: obj.fbid }, function (err2, obj2) {
            if (!obj2) {
                if (code === inputCode) {
                    Section.update({
                        sectionName: section,
                        subject: subject
                    }, {
                            $push: {
                                studentList: obj.fbid
                            }
                        }, (err, result) => {
                            if (err) {
                                let toSend = Object.assign({}, {
                                    replies: [
                                        {
                                            type: 'text',
                                            content: 'Please don\'t break any library doors -- just try again later.'
                                        },
                                        {
                                            type: 'text',
                                            content: 'Hmmm, it seems that something went wrong in enlisting you into the class.'
                                        }
                                    ],
                                }, {
                                        conversation: {
                                            memory: {}
                                        }
                                    });
                                res.send(toSend);
                            } else {
                                let toSend = Object.assign({}, {
                                    replies: [
                                        {
                                            type: 'text',
                                            content: 'Do you feel like you belong now?'
                                        },
                                        {
                                            type: 'text',
                                            content: 'You\'re now in the class!'
                                        }
                                    ],
                                }, received.conversation);
                                res.send(toSend);
                            }
                        })

                } else {
                    let toSend = Object.assign({}, {
                        replies: [{
                            type: 'text',
                            content: 'Hmm, It looks like you entered the code wrong.'
                        }],
                    }, received.conversation);
                    res.send(toSend);
                }
            } else {
                let toSend = Object.assign({}, {
                    replies: [{
                        type: 'text',
                        content: 'Wha-- You\'re already in this class! Are you okay?'
                    }],
                }, {
                        conversation: {
                            memory: {}
                        }
                    });
                res.send(toSend);
            }
        })
    })
});

app.post("/confirm-consultation", (req, res) => {
    let received = req.body;

    let section = received.conversation.memory.section.value.toUpperCase().replace(/ /g, '');
    let subject = received.conversation.memory.subject.value.toUpperCase().replace(/ /g, '');
    let start_time = '';
    let end_time = '';

    if (received.conversation.memory.interval) {
        start_time = received.conversation.memory.interval.begin;
        end_time = received.conversation.memory.interval.end;
    } else {
        start_time = received.conversation.memory.start.iso;
        end_time = received.conversation.memory.end.iso;
    }

    if (moment(start_time) - moment() < 0 || moment(end_time) - moment() < 0) {
        let toSend = Object.assign({}, {
            replies: [{
                type: 'text',
                content: 'Sorry, but the DeLorean is broken right now. Please repeat your request (but with a later date).'
            }],
        }, {
                conversation: {
                    memory: {}
                }
            });
        res.send(toSend);
    } else {
        Section.findOne({
            sectionName: section,
            subject: subject,
        }, function (err, obj) {
            if (!obj) {
                let toSend = Object.assign({}, {
                    replies: [{
                        type: 'text',
                        content: 'Not to hurt your pride and/or ego, but I think you misspelled some things there (subject or section, most likely). Please try again.'
                    }],
                }, {
                        conversation: {
                            memory: {}
                        }
                    });
                res.send(toSend);
            } else {
                let toSend = Object.assign({}, {
                    replies: [{
                        type: 'quickReplies',
                        content: {
                            title: `You want to schedule a consultation for the class ${subject} ${section} ${moment(start_time).format('MMMM Do, YYYY') === moment(end_time).format('MMMM Do, YYYY') ? `on ${moment(end_time).format('dddd, MMMM Do')} from ${moment(start_time).format('h:mm a')} to ${moment(end_time).format('h:mm a')}` : `from ${moment(start_time).format('dddd, MMMM Do, h:mm a')} to ${moment(end_time).format('dddd, MMMM Do, h:mm a')}`}?`,
                            buttons: [{
                                title: 'Yes',
                                value: 'Yes'
                            }, {
                                title: 'No',
                                value: 'No'
                            }]
                        }
                    }],
                }, {
                        conversation: {
                            memory: Object.assign({}, received.conversation.memory, {
                                start_time: start_time,
                                end_time: end_time
                            })
                        }
                    });
                res.send(toSend);
            }
        })
    }
});

app.post("/verify-class-enlisted", (req, res) => {
    let received = req.body;

    let section = received.conversation.memory.section.value.toUpperCase().replace(/ /g, '');
    let subject = received.conversation.memory.subject.value.toUpperCase().replace(/ /g, '');
    let start_time = received.conversation.memory.start_time;
    let end_time = received.conversation.memory.end_time;
})

analyzeEntities = (sender, res, input) => {
    //if wit only detected one intent
    console.log(sender);
    var conversationID = undefined;
    Conversationid.findOne({ fbid: sender }, function (err, obj) {
        if (obj) {
            conversationID = obj.conversationid;
            console.log(conversationID);
        }

        if (res.intents.length === 1) {
            if (res.intents[0].slug === "addconsultation") {
                if (!res.entities.subject) {
                    //if there is no subject in the user request
                    sendMessage(sender, {
                        text: 'You forgot to put a subject there, buddy.'
                    });
                    Conversationid.update({ fbid: sender }, { $set: { conversationid: undefined } });
                    // conversationID = undefined;
                } else if (res.entities.subject.length > 1) {
                    //error, should be one subject only
                    sendMessage(sender, {
                        text: 'Oh no! Only one subject per request please! I always pretend I\'m good at multitasking but in reality, I\'m really bad at it!'
                    });
                    Conversationid.update({ fbid: sender }, { $set: { conversationid: undefined } });
                    // conversationID = undefined;
                } else if (res.entities.subject.length == 1) {
                    build.dialog({
                        type: 'text',
                        content: input
                    }, {
                            conversationId: conversationID
                        })
                        .then(res => {
                            console.log(res);
                            conversationId = res.conversation.id;
                            res.messages.map((message) => {
                                if (message.type === 'quickReplies') {
                                    sendQuickReply(sender, message.content);
                                } else {
                                    sendMessage(sender, {
                                        text: message.content
                                    });
                                }
                            });
                        })
                        .catch((err) => {
                            sendMessage(sender, {
                                text: 'Oops, we got an error from Recast.ai, our magic Human Understandinator(tm). Please try again.'
                            }).catch(console.error);
                            console.log(err.stack || err);
                            Conversationid.update({ fbid: sender }, { $set: { conversationid: undefined } });
                            // conversationID = undefined;
                        })
                }
            } else if (res.intents[0].slug === "addclass") {
                if (res.entities.number && !res.entities.subject) {
                    sendMessage(sender, {
                        text: 'Only one subject at a time please, and please include it in the request.'
                    });
                    Conversationid.update({ fbid: sender }, { $set: { conversationid: undefined } });
                    // conversationID = undefined;
                } else if (!res.entities.subject && !res.entities.number) {
                    //if there is no subject in the user request
                    sendMessage(sender, {
                        text: 'I can\'t seem to find a subject in your request.'
                    });
                    Conversationid.update({ fbid: sender }, { $set: { conversationid: undefined } });
                    // conversationID = undefined;
                } else if (res.entities.subject.length > 1) {
                    //error, should be one subject only
                    sendMessage(sender, {
                        text: 'Only one subject per request please. I can only take so much.'
                    });
                    Conversationid.update({ fbid: sender }, { $set: { conversationid: undefined } });
                    // conversationID = undefined;
                } else if (res.entities.subject.length == 1) {
                    console.log(conversationID);
                    build.dialog({
                        type: 'text',
                        content: input
                    }, {
                            conversationId: conversationID
                        })
                        .then(res => {
                            console.log(res);
                            conversationID = res.conversation.id;
                            res.messages.map((message) => {
                                if (message.type === 'quickReplies') {
                                    sendQuickReply(sender, message.content);
                                } else {
                                    sendMessage(sender, {
                                        text: message.content
                                    });
                                }
                            });
                        })
                        .catch((err) => {
                            sendMessage(sender, {
                                text: 'Oops, we got an error from Recast.ai, our magic Human Understandinator(tm). Please try again.'
                            }).catch(console.error);
                            console.log(err.stack || err);
                            Conversationid.update({ fbid: sender }, { $set: { conversationid: undefined } });
                            // conversationID = undefined;
                        })
                }
            } else if (res.intents[0].slug === "confirmentry" || res.intents[0].slug === "getcode") {
                // conversationId = (typeof conversationId === 'undefined') ? Math.floor((Math.random() * 1000000) + 1) : conversationId;
                build.dialog({ type: 'text', content: input }, { conversationId: conversationID })
                    .then(res => {
                        console.log(res);
                        conversationId = res.conversation.id;
                        res.messages.map((message) => {
                            if (message.type === 'quickReplies') {
                                sendQuickReply(sender, message.content);
                            } else {
                                sendMessage(sender, { text: message.content });
                            }
                        });
                    })
                    .catch((err) => {
                        sendMessage(sender, {
                            text: 'Oops, we got an error from Recast.ai, our magic Human Understandinator(tm). Please try again.'
                        }).catch(console.error);
                        console.log(err.stack || err);
                        Conversationid.update({ fbid: sender }, { $set: { conversationid: undefined } });
                        // conversationID = undefined;
                    })
            } else if (res.intents[0].slug === "getsection" || res.intents[0].slug === "getsubject") {
                build.dialog({ type: 'text', content: input }, { conversationId: conversationID })
                    .then(res => {
                        conversationId = res.conversation.id;
                        sendQuickReply(sender, res.messages[0].content);
                    })
                    .catch((err) => {
                        sendMessage(sender, {
                            text: 'Oops, we got an error from Recast.ai, our magic Human Understandinator(tm). Please try again.'
                        }).catch(console.error);
                        console.log(err.stack || err);
                        Conversationid.update({ fbid: sender }, { $set: { conversationid: undefined } }, function (err, result) {

                        });
                        // conversationID = undefined;
                    })
            }
        }
    })
}

processPostback = (event) => {
    let senderId = event.sender.id;
    let payload = event.postback.payload;

    if (payload === "Greeting") {
        // conversationID = Math.floor((Math.random() * 1000000) + 1);
        checkID(senderId);
    }
}