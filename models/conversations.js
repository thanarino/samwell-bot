let mongoose = require('mongoose');
let Schema = mongoose.Schema;

let conversationSchema = new Schema({
    fbid: { type: String },
    conversationid: { type: String },
});

module.exports = mongoose.model("Conversationid", conversationSchema);