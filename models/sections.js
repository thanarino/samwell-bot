let mongoose = require('mongoose');
let Schema = mongoose.Schema;

let semesterSchema = new Schema({
    value: { type: String },
    endYear: { type: Number },
    startYear: { type: Number },
    start: { type: Number },
    end: { type: Number },
});

let sectionSchema = new Schema({
    _id: { type: String },
    userID: { type: String },
    sectionName: { type: String },
    studentList: { type: [String] },
    teacherList: { type: [String] },
    subject: { type: String },
    semester: semesterSchema,
    classType: { type: String },
    startTime: { type: String },
    endTime: { type: String },
    daysList: { type: [String] },
    description: { type: String },
    room: { type: String },
    code: { type: String },
    createdAt: { type: Date },
    isDeleted: { type: Boolean }
});

module.exports = mongoose.model("Section", sectionSchema, 'sections');