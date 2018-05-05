let express = require("express");
let request = require("request-promise");
let bodyParser = require("body-parser");
let mongoose = require('mongoose');
let recastai = require('recastai').default;
let moment = require('moment');
let _ = require('lodash');

let db = mongoose.connect(process.env.MONGODB_URI);
let Student = require('./models/students');
let Section = require('./models/sections');
let Conversationid = require('./models/conversations');
let Teachers = require('./models/teachers');
let Consultations = require('./models/consultations');

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

    console.log(req.body);

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

    console.log(received.conversation.memory.code);
    console.log(received.conversation.memory.inputCode)

    let code = received.conversation.memory.code.raw;
    let inputCode = received.conversation.memory.inputCode.raw;

    console.log(code);
    console.log(inputCode);

    Conversationid.findOne({ conversationid: received.conversation.id }, (err, obj) => {
        Section.findOne({ sectionName: section, subject: subject, studentList: obj.fbid }, function (err2, obj2) {
            console.log(obj);
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
                                            content: 'You must feel like you belong now. '
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
                    console.log("went here");
                    let toSend = Object.assign({}, {
                        replies: [{
                            type: 'text',
                            content: 'Hmm, It looks like you entered the code wrong.'
                        }],
                    }, {
                            conversation: {
                                memory: {}
                            }
                        });
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
        Conversationid.update({ conversationid: received.conversation.id }, { $set: { conversationid: undefined } });
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
                Conversationid.update({ conversationid: received.conversation.id }, { $set: { conversationid: undefined } });
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

returnResults = (res, received, results) => {
    console.log("after fxn results: ", results);
    if (results.length === 0) {
        //the student is not a student of the professor
        let toSend = Object.assign({}, {
            replies: [
                {
                    type: 'text',
                    content: 'I\'m sorry but you have to be a student of the professor first before you can check on his or her availability.'
                }
            ],
        }, {
                conversation: {
                    memory: {}
                }
            });
        Conversationid.update({ conversationid: received.conversation.id }, { $set: { conversationid: undefined } });
        res.send(toSend);
    } else if (results.length > 1) {
        //the student has 2 or more teachers with the same surname
        let string = `It seems that you have ${results.length} professors with the same last name! However, because I am kind and caring, here are all their statuses: `;
        results.map((teacher) => {
            string += `${teacher.gender === "male" ? `Sir` : `Ma'am`} ${teacher.given_name} ${teacher.family_name} is ${teacher.available ? 'available for consultation right now.' : ' not available for consultation right now.'}`
        });

        let toSend = Object.assign({}, {
            replies: [
                {
                    type: 'text',
                    content: string
                }
            ],
        }, {
                conversation: {
                    memory: {}
                }
            });
        Conversationid.update({ conversationid: received.conversation.id }, { $set: { conversationid: undefined } });
        res.send(toSend);
    } else {
        // the student has exactly 1 teacher with the same name as input
        let teacher = results[0];
        let toSend = Object.assign({}, {
            replies: [
                {
                    type: 'text',
                    content: `${teacher.gender === "male" ? `Sir` : `Ma'am`} ${teacher.given_name} ${teacher.family_name} is ${teacher.available ? 'available for consultation right now.' : ' not available for consultation right now.'}`
                }
            ],
        }, {
                conversation: {
                    memory: {}
                }
            });
        Conversationid.update({ conversationid: received.conversation.id }, { $set: { conversationid: undefined } });
        res.send(toSend);
    }
}

app.post("/check-available", (req, res) => {
    let received = req.body;

    console.log(received.conversation.memory);

    let gender = received.conversation.memory.gender.value;
    let family_name = _.lowerCase(received.conversation.memory.person.fullname);
    family_name = _.capitalize(family_name);

    let results = [];

    Conversationid.findOne({ conversationid: received.conversation.id }, (err, obj) => {
        if (obj) {
            // find all teachers same surname with input
            console.log(family_name);
            Teachers.find({ family_name: family_name, roles: 'teacher' }, (err2, docs) => {
                if (docs.length > 0) {
                    //find all sections that contain the teacher and the student
                    let studentID = obj.fbid;
                    console.log(docs);
                    console.log(studentID);
                    (async () => {
                        await docs.map((teacher) => {
                            Section.find({ studentList: studentID, teacherList: teacher._id, isDeleted: false }, (err2, docs2) => {
                                if (docs2.length > 0) {
                                    results.push(teacher);
                                    console.log("inloop results: ", results);
                                }
                            });
                            console.log('results', results);
                        });
                        await returnResults(res, received, results);
                    })();
                } else {
                    // no found teachers with the same surname as input.
                    let toSend = Object.assign({}, {
                        replies: [
                            {
                                type: 'text',
                                content: 'I can\'t seem to find a professor with that surname. Please check your spelling and try again.'
                            }
                        ],
                    }, {
                            conversation: {
                                memory: {}
                            }
                        });
                    Conversationid.update({ conversationid: received.conversation.id }, { $set: { conversationid: undefined } });
                    res.send(toSend);
                }
            });
        }
    });
})

app.post("/verify-class-enlisted", (req, res) => {
    let received = req.body;

    let section = received.conversation.memory.section.value.toUpperCase().replace(/ /g, '');
    let subject = received.conversation.memory.subject.value.toUpperCase().replace(/ /g, '');
    let start_time = received.conversation.memory.start_time;
    let end_time = received.conversation.memory.end_time;


    Conversationid.findOne({ conversationid: req.body.conversation.id }, function (err, obj) {
        if (obj) {
            Section.findOne({
                sectionName: section,
                subject: subject,
                studentList: obj.fbid,
                isDeleted: false
            }, function (err2, obj2) {
                if (obj2) {
                    console.log(obj2);
                    if (obj2.teacherList.length > 1) {
                        //if many teachers in a classroom
                    } else if (obj2.teacherList.length == 1) {
                        Teachers.findOne({ _id: obj2.teacherList[0] }, function (err3, obj3) {
                            if (obj3) {
                                let toSend = Object.assign({}, {
                                    replies: [{
                                        type: 'quickReplies',
                                        content: {
                                            title: `You want to schedule a consultation with ${obj3.gender === "male" ? `Sir` : `Ma'am`} ${obj3.given_name} ${obj3.family_name}, right?`,
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
                                            memory: {
                                                teacher: obj3,
                                                section: received.conversation.memory.section,
                                                subject: received.conversation.memory.subject,
                                                interval: received.conversation.memory.interval,
                                                start_time: received.conversation.memory.start_time,
                                                end_time: received.conversation.memory.end_time,
                                            }
                                        }
                                    });
                                res.send(toSend);
                            } else {
                                let toSend = Object.assign({}, {
                                    replies: [
                                        {
                                            type: 'text',
                                            content: 'This is weird -- I can\'t find the teacher. Contact the administrator to find this rogue Professor.'
                                        }
                                    ],
                                }, {
                                        conversation: {
                                            memory: {}
                                        }
                                    });
                                Conversationid.update({ conversationid: received.conversation.id }, { $set: { conversationid: undefined } });
                                res.send(toSend);
                            }
                        })
                    } else {
                        let toSend = Object.assign({}, {
                            replies: [
                                {
                                    type: 'text',
                                    content: 'This class has no teachers! How can this happen? Please blame the administrator.'
                                }
                            ],
                        }, {
                                conversation: {
                                    memory: {}
                                }
                            });
                        Conversationid.update({ conversationid: received.conversation.id }, { $set: { conversationid: undefined } });
                        res.send(toSend);
                    }
                } else if (!obj2) {
                    let toSend = Object.assign({}, {
                        replies: [
                            {
                                type: 'text',
                                content: 'It seems that you are not yet enlisted in this section yet. Please ask your teacher for the class code.'
                            }
                        ],
                    }, {
                            conversation: {
                                memory: {}
                            }
                        });
                    Conversationid.update({ conversationid: received.conversation.id }, { $set: { conversationid: undefined } });
                    res.send(toSend);
                }
            })
        }
    })
});

checkConsultationHoursConflict = (time, u_start, u_end, t_id) => {
    //format consultation hours of professor
    let db_start = moment(time.start, 'hh:mm').set({ 'year': u_start.get('year'), 'month': u_start.get('month'), 'date': u_start.get('date') });
    let db_end = moment(time.end, 'hh:mm').set({ 'year': u_end.get('year'), 'month': u_end.get('month'), 'date': u_end.get('date') });

    console.log(`db_start: ${db_start}`);
    console.log(`db_end: ${db_end}`);
    console.log(`u_start: ${u_start}`);
    console.log(`u_end: ${u_end}`);

    if (db_start - u_start <= 0) {  // consultation hours start before consultation
        if (u_end - db_end <= 0) {  // consultation hours end after consultation
            return true;
        } else {
            return false
        }
    } else {
        return false;
    }

};

checkConsultationConflict = (u_start, u_end, t_id) => {
    return new Promise((resolve, reject) => {
        var result = [];
        // check if scheduled consultation hour is not occupied by other consultation hours
        Consultations.find({ teacherID: t_id, isApprovedByTeacher: true, isDone: false, date: u_start.dayOfYear(), year: u_start.get('year') }, function (err, docs) {
            console.log(`docs:`);
            console.log(docs);
            console.log(docs.length);
            if (err) {
                console.log(err);
            }
            if (docs.length > 0) {
                console.log('went here');
                // teacher has consultations in that day
                docs.map((consultation) => {
                    let doy = moment().dayOfYear(consultation.date).set({ 'year': consultation.year });
                    let c_start = moment(consultation.startTime, 'hh:mm').set({
                        'year': doy.get('year'),
                        'month': doy.get('month'),
                        'date': doy.get('date')
                    });
                    let c_end = moment(consultation.endTime, 'hh:mm').set({
                        'year': doy.get('year'),
                        'month': doy.get('month'),
                        'date': doy.get('date')
                    });

                    // check if start and end of user consultation is in between db consultations
                    // check if start and end of db consultation is in between user consultations

                    if ((u_start.isBetween(c_start, c_end) || u_end.isBetween(c_start, c_end)) || (c_start.isSame(u_start) || c_end.isSame(u_end))) {
                        result.push(false);
                    } else {
                        if (c_start.isBetween(u_start, u_end) || c_end.isBetween(u_start, u_end)) {
                            result.push(false);
                        } else {
                            result.push(true);
                        }
                    }
                });
            } else {
                result.push(true);
            }
        }).then(() => {
            console.log(`result: ${result}`);
            resolve(result);
        });
    })
}

app.post("/verify-consultation-hours", (req, res) => {
    let received = req.body;

    let section = received.conversation.memory.section.value.toUpperCase().replace(/ /g, '');
    let subject = received.conversation.memory.subject.value.toUpperCase().replace(/ /g, '');
    let start_time = received.conversation.memory.start_time;
    let end_time = received.conversation.memory.end_time;
    let teacher = received.conversation.memory.teacher;

    let t_id = received.conversation.memory.teacher._id;

    //check if time falls under consultation hours of prof

    //format user inputted start and end times
    let u_start = moment(received.conversation.memory.start_time);
    let u_end = moment(received.conversation.memory.end_time);

    if (u_end - u_start <= 0) {
        let toSend = Object.assign({}, {
            replies: [
                {
                    type: 'text',
                    content: 'Give me the Eye of Agamotto and I\'ll schedule you on that timeslot. Otherwise, feel free to try again. :)'
                }
            ],
        }, { conversation: { memory: {} } });
        Conversationid.update({ conversationid: received.conversation.id }, { $set: { conversationid: undefined } });
        res.send(toSend);
    }

    let weekday = moment(received.conversation.memory.start_time).format('dddd');
    console.log(weekday);
    received.conversation.memory.teacher.consultationHours.map((day) => {
        console.log(day);
        if (day.fullName === weekday) {
            if (day.time.length === 0) {
                let toSend = Object.assign({}, {
                    replies: [
                        {
                            type: 'text',
                            content: 'There doesn\'t seem to be scheduled consultation hours for this day. Try scheduling for another date.'
                        }
                    ],
                }, { conversation: { memory: {} } });
                Conversationid.update({ conversationid: received.conversation.id }, { $set: { conversationid: undefined } });
                res.send(toSend);
            } else {
                let tripcheck = day.time.some((time) => checkConsultationHoursConflict(time, u_start, u_end, t_id));
                if (tripcheck) {
                    var tripcheck2;
                    checkConsultationConflict(u_start, u_end, t_id).then((result) => {
                        tripcheck2 = result;

                        console.log(tripcheck2);
                        if (_.includes(tripcheck2, true)) {
                            //schedule here

                            Section.findOne({ sectionName: section, subject: subject }, (err, classFound) => {
                                if (classFound) {
                                    let sem_start = moment().dayOfYear(classFound.semester.start).set({ 'year': classFound.semester.startYear });
                                    let sem_end = moment().dayOfYear(classFound.semester.end).set({ 'year': classFound.semester.endYear });
                                    
                                    console.log(`sem_start: ${sem_start}`);
                                    console.log(`sem_end: ${sem_end}`);
                                    console.log(`u_start: ${u_start}`);
                                    console.log(`u_end: ${u_end}`);
                                    
                                    if (sem_start - u_start > 0) {
                                        let toSend = Object.assign({}, {
                                            replies: [{
                                                type: 'text',
                                                content: 'I commend you for your eagerness, but you can\'t schedule a consultation before the semester officially starts. Please try scheduling at a later date.'
                                            }],
                                        }, {
                                            conversation: {
                                                memory: {}
                                            }
                                        });
                                        Conversationid.update({
                                            conversationid: received.conversation.id
                                        }, {
                                            $set: {
                                                conversationid: undefined
                                            }
                                        });
                                        res.send(toSend);
                                    } else if (sem_end - u_end < 0) {
                                        let toSend = Object.assign({}, {
                                            replies: [{
                                                type: 'text',
                                                content: 'I\'m really sorry, but you can\'t schedule a consultation after the semester officially ends. Please try scheduling at an earlier date.'
                                            }],
                                        }, {
                                            conversation: {
                                                memory: {}
                                            }
                                        });
                                        Conversationid.update({
                                            conversationid: received.conversation.id
                                        }, {
                                            $set: {
                                                conversationid: undefined
                                            }
                                        });
                                        res.send(toSend);
                                    } else {
                                        Conversationid.findOne({
                                            conversationid: received.conversation.id
                                        }, function (err, obj) {
                                            if (obj) {
                                                Consultations.create({
                                                    _id: (Math.random() * 1e20).toString(36),
                                                    userID: obj.fbid,
                                                    studentID: obj.fbid,
                                                    teacherID: t_id,
                                                    sectionID: classFound._id,
                                                    startTime: u_start.format('HH:mm'),
                                                    endTime: u_end.format('HH:mm'),
                                                    date: u_start.dayOfYear(),
                                                    year: u_start.get('year'),
                                                    isDone: false,
                                                    isDeleted: false,
                                                    isApprovedByStudent: true,
                                                    isApprovedByTeacher: false,
                                                    createdAt: new Date()
                                                }, function (err, returned) {
                                                    if (err) {
                                                        let toSend = Object.assign({}, {
                                                            replies: [{
                                                                type: 'text',
                                                                content: 'Hmm, I think there\'s a problem with my memory right now. Please try again later.'
                                                            }],
                                                        }, {
                                                            conversation: {
                                                                memory: {}
                                                            }
                                                        });
                                                        Conversationid.update({
                                                            conversationid: received.conversation.id
                                                        }, {
                                                            $set: {
                                                                conversationid: undefined
                                                            }
                                                        });
                                                        res.send(toSend);
                                                    } else {
                                                        let toSend = Object.assign({}, {
                                                            replies: [{
                                                                type: 'text',
                                                                content: 'Alright! Don\'t forget your consultation!'
                                                            }],
                                                        }, {
                                                            conversation: {
                                                                memory: {}
                                                            }
                                                        });
                                                        Conversationid.update({
                                                            conversationid: received.conversation.id
                                                        }, {
                                                            $set: {
                                                                conversationid: undefined
                                                            }
                                                        });
                                                        res.send(toSend);
                                                    }
                                                });
                                            } else {
                                                let toSend = Object.assign({}, {
                                                    replies: [{
                                                        type: 'text',
                                                        content: 'There seems to be a problem :\\ No worries, just try again later.'
                                                    }],
                                                }, {
                                                    conversation: {
                                                        memory: {}
                                                    }
                                                });
                                                Conversationid.update({
                                                    conversationid: received.conversation.id
                                                }, {
                                                    $set: {
                                                        conversationid: undefined
                                                    }
                                                });
                                                res.send(toSend);
                                            }
                                        });
                                    }
                                }
                            });
                        } else {
                            //error, conflict with other consultations
                            let toSend = Object.assign({}, {
                                replies: [
                                    {
                                        type: 'text',
                                        content: 'Looks like your prof\'s in demand. Please schedule in another timeslot.'
                                    }
                                ],
                            }, { conversation: { memory: {} } });
                            Conversationid.update({ conversationid: received.conversation.id }, { $set: { conversationid: undefined } });
                            res.send(toSend);
                            //TODO: SEND CONSULTATION HOURS OF PROFESSOR
                        }
                    });
                } else {
                    //error, conflict with consultation hours
                    let toSend = Object.assign({}, {
                        replies: [
                            {
                                type: 'text',
                                content: 'Remember that you can only schedule a consultation within the professor\'s consultation hours. Please schedule in another timeslot.'
                            }
                        ],
                    }, { conversation: { memory: {} } });
                    Conversationid.update({ conversationid: received.conversation.id }, { $set: { conversationid: undefined } });
                    res.send(toSend);
                    //TODO: SEND CONSULTATION HOURS OF PROFESSOR
                }
            }
        }
    });
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
                    let tempID = Math.floor((Math.random() * 1000000) + 1);
                    Conversationid.update({ fbid: sender }, { $set: { conversationid: tempID } }, function (err, result) {
                        if (result) {
                            conversationID = tempID;
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
                    let tempID = Math.floor((Math.random() * 1000000) + 1);
                    Conversationid.update({ fbid: sender }, { $set: { conversationid: tempID } }, function (err, result) {
                        if (result) {
                            conversationID = tempID;
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
                    });
                }
            } else if (res.intents[0].slug === "confirmentry" || res.intents[0].slug === "getcode" || res.intents[0].slug === "verifycode" || res.intents[0].slug === 'checkavailable') {
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