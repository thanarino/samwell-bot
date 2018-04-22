let mongoose = require('mongoose');
let Schema = mongoose.Schema;

let timeSchema = new Schema({
    start: { type: String },
    end: { type: String }
})

let daySchema = new Schema({
    day: { type: String },
    time: { type: [timeSchema] },
    fullName: { type: String }
})

let teacherSchema = new Schema({
    _id: { type: String },
    createdAt: { type: Date },
    services: {
        google: {
            accessToken: { type: String },
            idToken: { type: String },
            scope: { type: [String] },
            expiresAt: { type: Number },
            id: { type: String },
            email: { type: String },
            name: { type: String },
            given_name: { type: String },
            family_name: { type: String },
            picture: { type: String },
            gender: { type: String },
        },
        resume: {
            loginTokens: {type: [String]},
        }
    },
    profile: {
        name: { type: String },
        organization: { type: [String] }
    },
    department: { type: String },
    office: { type: String },
    position: { type: String },
    available: { type: Boolean },
    approved: { type: Boolean },
    isDeleted: { type: Boolean },
    classes: { type: [String] },
    consultationHours: { type: [daySchema] },
    email: { type: String },
    given_name: { type: String },
    middle_name: { type: String },
    family_name: { type: String },
    gender: { type: String },
    roles: { type: [String] }
});

module.exports = mongoose.model("Teacher", teacherSchema, 'users');