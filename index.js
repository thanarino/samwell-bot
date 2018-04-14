let express = require("express");
let request = require("request-promise");
let bodyParser = require("body-parser");
let mongoose = require('mongoose');
let recastai = require('recastai').default;

let db = mongoose.connect(process.env.MONGODB_URI);
let Student = require('./models/students');

let connect = new recastai.connect(process.env.REQUEST_TOKEN);

let app = express();
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 5000));

app.post('/', function (req, res) {
    connect.handleMessage(req, res, onMessage);
})

function onMessage(message) {
    var content = message.content;
    var type = message.type;

    console.log(message);

    message.addReply([{ type: 'text', content: 'Hello, World!' }])
    message.reply();
}

// let { isTyping, sendMessage } = require('./exports/common');
// let { checkID } = require('./exports/signup');

// const WIT_TOKEN = process.env.WIT_TOKEN;
// const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
// const FB_APP_SECRET = process.env.FB_APP_SECRET;

// const sessions = {};

// const findOrCreateSession = (fbid) => {
//     let sessionId;
//     Object.keys(sessions).forEach(k => {
//         if (sessions[k].fbid === fbid) {
//             sessionId = k;
//         }
//     });
//     if (!sessionId) {
//         sessionId = new Date().toISOString();
//         sessions[sessionId] = { fbid: fbid, context: {} };
//     }
//     return sessionId;
// };

// const wit = new Wit({
//     accessToken: WIT_TOKEN,
//     logger: new log.Logger(log.INFO)
// });

// let app = express();
// app.use(bodyParser.urlencoded({
//     extended: false
// }));
// app.use(bodyParser.json());
// app.listen((process.env.PORT || 5000));

// // Server index page
// app.get("/", (req, res) => {
//     res.send("Deployed!");
// });

// // Facebook Webhook
// // Used for verification
// app.get("/webhook", (req, res) => {
//     if (req.query["hub.verify_token"] === process.env.VERIFICATION_TOKEN) {
//         console.log("Verified webhook");
//         res.status(200).send(req.query["hub.challenge"]);
//     } else {
//         console.error("Verification failed. The tokens do not match.");
//         res.sendStatus(403);
//     }
// });

// // All callbacks for Messenger will be POST-ed here
// app.post("/webhook", (req, res) => {
//     // Make sure this is a page subscription
//     if (req.body.object == "page") {
//         // Iterate over each entry
//         // There may be multiple entries if batched
//         req.body.entry.forEach((entry) => {
//             // Iterate over each messaging event
//             entry.messaging.forEach((event) => {
//                 if (event.postback) {
//                     processPostback(event);
//                 } else if (event.message && !event.message.is_echo) {
//                     const sender = event.sender.id;
//                     const { text, attachments } = event.message;

//                     if (attachments) {
//                         sendMessage(sender, { text: 'Sorry, I can only understand text messages for now.' })
//                             .catch(console.error);
//                     } else if (text) {
//                         wit.message(text).then((res) => {
//                             analyzeEntities(sender, res);
//                             // console.log(JSON.stringify(entities));
//                             // sendMessage(sender, { text: `We've recieved your message: ${text}.` })
//                         })
//                             .catch((err) => {
//                                 sendMessage(sender, {
//                                         text: 'Oops, we got an error from Wit.ai, our magic Human Understandinator(tm). Please try again.'
//                                     }).catch(console.error);
//                                 console.log(err.stack || err);
//                         }) 
//                     } else {
//                         console.log('recieved event', JSON.stringify(event));
//                     }
//                 }
//             });
//         });

//         res.sendStatus(200);
//     }
// });

// analyzeEntities = (sender, res) => {
//     const entities = res.entities;
//     //if wit only detected one intent
//     if (entities.intent.length === 1) {
//         if (entities.intent[0].value === "scheduleConsultation") {
//             if (!entities.subject) {
//                 //if there is no subject in the user request
//                 sendMessage(sender, { text: 'Please include a subject in your request.' })
//             } else if (entities.subject.length > 1) {
//                 //error, should be one subject only
//                 sendMessage(sender, { text: 'Oh no! Only one subject per request please! I always pretend I\'m good at multitasking but in reality, I\'m really bad at it!' });
//             } else if (entities.subject.length == 1) {
//                 sendMessage(sender, { text: 'Okay! I\'m on it!' })
//             }
//         } else if (entities.intent[0].value === "addClass") {
            
//         }
//     }
// }

// processPostback = (event) => {
//     let senderId = event.sender.id;
//     let payload = event.postback.payload;

//     if (payload === "Greeting") {
//         checkID(senderId);
//     }
// }