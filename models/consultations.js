let mongoose = require('mongoose');
let Schema = mongoose.Schema;

let consultationSchema = new Schema({
    _id: { type: String },
    userID: { type: String },
    studentID: { type: String },
    teacherID: { type: String },
    sectionID: { type: String },
    startTime: { type: String },
    endTime: { type: String },
    date: { type: Number },
    startDate: { type: Date },
    year: { type: Number },
    isDone: { type: Boolean },
    isDeleted: { type: Boolean },
    isApprovedByStudent: { type: Boolean },
    isApprovedByTeacher: { type: Boolean },
    createdAt: { type: Date },
});

module.exports = mongoose.model("Consultation", consultationSchema, 'consultations');