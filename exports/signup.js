let express = require("express");
let request = require("request-promise");
let bodyParser = require("body-parser");
let mongoose = require('mongoose');
let Wit = require('node-wit').Wit;
let log = require('node-wit').log;

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

module.exports = {
    checkID: checkID,
}