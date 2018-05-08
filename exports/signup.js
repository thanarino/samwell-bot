let express = require("express");
let request = require("request-promise");
let bodyParser = require("body-parser");
let mongoose = require('mongoose');

let db = mongoose.connect(process.env.MONGODB_URI);
let Student = require('../models/students');

let { isTyping, sendMessage } = require('./common');

checkID = (userID) => {
    Student.findOne({ _id: userID }, (err, student) => {
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
                    }, (error, response, body) => {
                        let greeting = "";
                        if (error) {
                            isTyping(userID, false);
                            sendMessage(userID, { text: "A request error has occurred. Please delete this conversation and try again!" });
                        } else {
                            let bodyObj = JSON.parse(body);

                            let data = {
                                "_id": userID,
                                "given_name": bodyObj.first_name,
                                "family_name": bodyObj.last_name,
                                "profile_pic": bodyObj.profile_pic,
                                "gender": bodyObj.gender,
                                "createdAt": new Date(),
                                "roles": ['student'],
                            };

                            Student.create(data, (err, results) => {
                                if (err) {
                                    isTyping(userID, false);
                                    sendMessage(userID, { text: "A request error has occurred. Please delete this conversation and try again!" });
                                } else {
                                    isTyping(userID, false);
                                    sendMessage(userID, { text: `Sign up successful! You are now signed in, ${bodyObj.first_name}!` }).then(() => {
                                        sendMessage(userID, { text: `Welcome to my service! I am Samwell, a consultation hours scheduler chatbot made by Jonathan A. Arino, a UPLB student, as a requirement for his CMSC190-2 Special Problem. Let me give you a rundown of what I can do: ` }).then(() => {
                                            sendMessage(userID, { text: `Add to class → You can only schedule a consultation with a professor that teaches a class you're in. In your request, make sure to include the subject and section so I can understand you better. Also, your professor should also have provided a code in order to enter the classroom, don't worry, you won't need to include that in your request, I'll ask you for it.` }).then(() => {
                                                sendMessage(userID, { text: `Schedule a consultation → In scheduling a consultation, you must include the subject, section, date, and time in your request. Note that the teacher will have to confirm your consultation in order to be scheduled into the system.` }).then(() => {
                                                    sendMessage(userID, { text: `Check consultation hours → You can ask me to get the consultation hours of your professor! Just make sure to include the last name of your professor in your request, and of course, the day of the week.` }).then(() => {
                                                        sendMessage(userID, { text: `I can also check if your professor is entertaining consultations right now, just make sure to include the last name of your professor in your request. :D` }).then(() => {
                                                            sendMessage(userID, { text: `That was a WALL of text, but if ever you need help, just ask!` }).then(() => {
                                                                sendMessage(userID, { text: `Finally, please be patient with me, as I am not sure if I will understand all of your requests. If you experience any problems or have suggestions, please contact my Maker at arinojonathan@gmail.com.` });
                                                            })
                                                        })
                                                    })
                                                })
                                            })
                                        })
                                    });
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

module.exports = {
    checkID: checkID,
}