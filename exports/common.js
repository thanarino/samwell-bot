import * as request from 'request-promise';

// sends message to user
sendMessage = (recipientId, message) => {
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

isTyping = (recipientId, isTyping) => {
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
    }, (error, response, body) => {
        if (error) {
            console.log("Error sending message: " + response.error);
        }
    });
}

module.exports = {
    sendMessage: sendMessage,
    isTyping: isTyping,
}