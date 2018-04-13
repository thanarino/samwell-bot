let mongoose = require('mongoose');
let Schema = mongoose.Schema;

let studentSchema = new Schema({
    _id: { type: String },
    given_name: { type: String },
    family_name: { type: String },
    profile_pic: { type: String },
    gender: { type: String },
});

module.exports = mongoose.model("Student", studentSchema, 'users');