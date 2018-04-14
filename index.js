var express = require("express");
var request = require("request-promise");
var bodyParser = require("body-parser");
var mongoose = require('mongoose');
var Wit = require('node-wit').Wit;
var log = require('node-wit').log;

var db = mongoose.connect(process.env.MONGODB_URI);
var Student = require('./models/students');

const WIT_TOKEN = process.env.WIT_TOKEN;
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

const wit = new Wit({
    accessToken: WIT_TOKEN,
    logger: new log.Logger(log.INFO)
});

var app = express();
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 5000));

// Server index page
app.get("/", function (req, res) {
    res.send("Deployed!");
});

// Facebook Webhook
// Used for verification
app.get("/webhook", function (req, res) {
    if (req.query["hub.verify_token"] === process.env.VERIFICATION_TOKEN) {
        console.log("Verified webhook");
        res.status(200).send(req.query["hub.challenge"]);
    } else {
        console.error("Verification failed. The tokens do not match.");
        res.sendStatus(403);
    }
});

// All callbacks for Messenger will be POST-ed here
app.post("/webhook", function (req, res) {
    // Make sure this is a page subscription
    if (req.body.object == "page") {
        // Iterate over each entry
        // There may be multiple entries if batched
        req.body.entry.forEach(function (entry) {
            // Iterate over each messaging event
            entry.messaging.forEach(function (event) {
                if (event.postback) {
                    processPostback(event);
                } else if (event.message && !event.message.is_echo) {
                    const sender = event.sender.id;
                    const { text, attachments } = event.message;

                    if (attachments) {
                        sendMessage(sender, { text: 'Sorry, I can only understand text messages for now.' })
                            .catch(console.error);
                    } else if (text) {
                        wit.message(text).then((entities) => {
                            console.log(JSON.stringify(entities));
                            sendMessage(sender, { text: `We've recieved your message: ${text}.` })
                        })
                            .catch((err) => {
                                console.log('Oops, we got an error from Wit.ai, our Magic Human Understandinator(tm): ', err.stack || err);
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

function processPostback(event) {
    var senderId = event.sender.id;
    var payload = event.postback.payload;

    if (payload === "Greeting") {
        checkID(senderId);
    }
}

// sends message to user
function sendMessage(recipientId, message) {
    return request({
        url: "https://graph.facebook.com/v2.6/me/messages",
        qs: {
            access_token: process.env.PAGE_ACCESS_TOKEN
        },
        method: "POST",
        json: {
            recipient: {
                id: recipientId
            },
            message: message,
        }
    });
}

function isTyping(recipientId, isTyping) {
    let typing = isTyping ? "typing_on" : "typing_off";
    request({
        url: "https://graph.facebook.com/v2.6/me/messages",
        qs: {
            access_token: process.env.PAGE_ACCESS_TOKEN
        },
        method: "POST",
        json: {
            recipient: {
                id: recipientId
            },
            sender_action: typing,
        }
    }, function (error, response, body) {
        if (error) {
            console.log("Error sending message: " + response.error);
        }
    });
}

function checkID(userID) {
    Student.findOne({ _id: userID }, function (err, student) {
        if (err) {
            sendMessage(userID, { text: "Something went wrong. Please delete this conversation and try again!" });
        } else if (!student) {
            sendMessage(userID, { text: "It seems that you are not registered yet." }).then(() => {
                sendMessage(userID, { text: "Registering your account, please wait..." }).then(() => {
                    isTyping(userID, true);
                    request({
                        url: "https://graph.facebook.com/v2.6/" + userID,
                        qs: {
                            access_token: process.env.PAGE_ACCESS_TOKEN,
                            fields: "first_name, last_name, profile_pic, gender"
                        },
                        method: "GET"
                    }, function (error, response, body) {
                        var greeting = "";
                        if (error) {
                            isTyping(userID, false);
                            sendMessage(userID, { text: "A request error has occurred. Please delete this conversation and try again!" });
                        } else {
                            var bodyObj = JSON.parse(body);

                            let data = {
                                "_id": userID,
                                "given_name": bodyObj.first_name,
                                "family_name": bodyObj.last_name,
                                "profile_pic": bodyObj.profile_pic,
                                "gender": bodyObj.gender,
                                "createdAt": new Date(),
                                "roles": ['student'],
                            };

                            Student.create(data, function (err, results) {
                                if (err) {
                                    isTyping(userID, false);
                                    sendMessage(userID, { text: "A request error has occurred. Please delete this conversation and try again!" });
                                } else {
                                    isTyping(userID, false);
                                    sendMessage(userID, { text: `Sign up successful! You are now signed in, ${bodyObj.first_name}!` });
                                }
                            })
                        }
                    });
                })
            })
        } else if (student) {
            sendMessage(userID, { text: `Welcome back, ${student.given_name}!` });
        }
    });
}