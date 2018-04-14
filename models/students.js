"use strict";

import mongoose from 'mongoose';
let Schema = mongoose.Schema;

let studentSchema = new Schema({
    _id: { type: String },
    given_name: { type: String },
    family_name: { type: String },
    profile_pic: { type: String },
    gender: { type: String },
    createdAt: { type: Date },
    roles: { type: [String] },
});

export default mongoose.model("Student", studentSchema, 'users');