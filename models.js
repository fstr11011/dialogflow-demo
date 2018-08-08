'use strict';

var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var UserInfoSchema = new Schema({
    employeeNumber: Number,
    name: String,
    PIN: Number,
    address: String
});

var UserInfo = mongoose.model("UserInfo", UserInfoSchema);

module.exports.UserInfo = UserInfo;