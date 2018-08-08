'use strict';

var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var UserInfoSchema = new Schema({
    employeeNumber: Number,
    name: String,
    verbalCode: String,
    address: String
});

var UserInfo = mongoose.model("UserInfo", UserInfoSchema);

module.exports.UserInfo = UserInfo;