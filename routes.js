'use strict';

var express = require("express");
var router = express.Router();
var config = require("./config");
var UserInfo = require("./models").UserInfo;
var bodyParser = require("body-parser").json;
var request = require("request");
const uuidv1 = require("uuid/v1");

router.use(bodyParser());

var postData = {
    tenancyName: config.tenancyName,
    usernameOrEmailAddress: config.usernameOrEmailAddress,
    password: config.password
};

var auth = config.auth;

var authOptions = {
    method: "post",
    body: postData,
    json: true,
    url: auth
};

router.get("/", function(req, res, next){
    UserInfo.find({})
            .sort({employeeNumber: 1})
            .exec(function(err, info){
                if(err) return next(err);
                res.json(info);
            });
});

router.post("/", function(req, res, next){

    var sessionID = uuidv1();
    //looks for employee in DB based on employee ID
    if(req.body.queryResult.action === "employeeLookUp"){
            UserInfo.findOne({employeeNumber: req.body.queryResult.parameters.employeeNumber})
                .exec(function(err, info){
                    if(err) return next(err);
                    if(info){
                        res.json({
                            "followupEventInput": {
                                "name": "custom_hello",
                                "parameters": {
                                    "name": info.name
                                },
                                "languageCode": "en-US"
                              }
                        });
                    } else {
                        res.json({
                            "followupEventInput": {
                                "name": "bad_employee_number",
                                "languageCode": "en-US"
                            }
                        });
                    }
            });
    }

    //checks if the given PIN number matches the one in the DB
    if(req.body.queryResult.action === "checkPIN" && req.body.queryResult.parameters.pin !== ""){
        UserInfo.findOne({employeeNumber: req.body.queryResult.outputContexts[0].parameters.employeeNumber})
            .exec(function(err, info){
                if(err) return next(err);
                if(req.body.queryResult.parameters.pin === info.PIN){
                    res.json({
                        "fulfillmentText": "Thanks!  It looks like your current address is " + info.address + ".  Would you like to update this?"
                    });
                } else {
                    res.json({
                        "followupEventInput": {
                            "name": "bad_pin",
                            "languageCode": "en-US"
                        }
                    });
                }
        });
    }

    //adds change to UiOrchestrator queue
    if(req.body.queryResult.action === "addQueue"){
    
        var addressChange = req.body.queryResult.parameters.newAddress;
        var employeeNumber = req.body.queryResult.outputContexts[0].parameters.employeeNumber;
        var originalAddress;
        var name;

        UserInfo.findOne({employeeNumber: employeeNumber})
        .exec(function(err, info){
            if(err) return err;
            if(info){
                originalAddress = info.address;
                name = info.name;
            }
        });

        request(authOptions, function(err, response, body){
            if(err){
                console.error('error posting json: ', err);
                throw err;
            }
            console.log(JSON.stringify(body));

            var queueURL = config.queueUrl;
            
            var postDataQueue = {
                itemData: {
                    Priority: "Normal",
                    Reference: addressChange,
                    Name: "ApiQueue",
                    SpecificContent: {
                        employeeNumber: employeeNumber,
                        address: addressChange,
                        originalAddress: originalAddress,
                        name: name
                    }
                }
            };

            var queueOptions = {
                method: "post",
                body: postDataQueue,
                auth: { bearer: body.result},
                json: true,
                url: queueURL
            };

            var jobURL = "https://platform.uipath.com/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs";

            var jobData = {
                startInfo: {
                    ReleaseKey: "36ba6a22-0248-458a-943a-8f54ae31966c",
                    Strategy: "All",
                    RobotIds: [],
                    NoOfRobots: 0
                }
            };

            var jobOptions = {
                method: "post",
                body: jobData,
                auth: { bearer: body.result},
                json: true,
                url: jobURL
            };

            request(queueOptions, function(err, response, body){
                if(err){
                    console.error('error parsing json: ', err);
                    throw err;
                    res.sendStatus(500);
                } else{
                    console.log(JSON.stringify(body));
                    console.log("Operation succesfully completed");
                    res.json({
                        "fulfillmentText": "Thank you! Your request is being processed and you should receive a confirmation email in the next 5 minutes.  Enjoy the rest of your day!"
                    });
                }
            });

            request(jobOptions, function (err, res, body) {
                if (err) {
                    console.error('error posting json: ', err);
                    throw err
                } else {
                   console.log("Job succesfully started")
                }
            });
        });
    }

    if(req.body.queryResult.action === "newemployee" && req.body.queryResult.parameters.employeeAddress !== "" && req.body.queryResult.parameters.lastName !== "" && req.body.queryResult.parameters.employeeNumber !== "" && req.body.queryResult.parameters.employeePIN !== "" && req.body.queryResult.parameters.firstName !== ""){
        var employeeInfo = {
            "employeeNumber": req.body.queryResult.parameters.employeeNumber,
            "firstName": req.body.queryResult.parameters.firstName,
            "lastName": req.body.queryResult.parameters.lastName,
            "PIN": req.body.queryResult.parameters.employeePIN,
            "address": req.body.queryResult.parameters.employeeAddress
        };

        var newEmployee = new UserInfo(employeeInfo);
        newEmployee.save(function(err, user){
            if(err) return next(err);

            var firstName = req.body.queryResult.parameters.firstNam;
            var lastName = req.body.queryResult.parameters.lastName;
            var PIN = req.body.queryResult.parameters.employeePIN;
            var employeeNumber = req.body.queryResult.parameters.employeeNumber;
            var address = req.body.queryResult.parameters.employeeAddress;

            request(authOptions, function(err, response, body){
                if(err){
                    console.error('error posting json: ', err);
                    throw err;
                }
                console.log(JSON.stringify(body));
    
                var queueURL = config.queueUrl;
                
                var postDataQueue = {
                    itemData: {
                        Priority: "Normal",
                        Reference: addressChange,
                        Name: "NewEmployee",
                        SpecificContent: {
                            firstName: firstName,
                            lastName: lastName,
                            PIN: PIN,
                            employeeNumber: employeeNumber,
                            address: address
                        }
                    }
                };
    
                var queueOptions = {
                    method: "post",
                    body: postDataQueue,
                    auth: { bearer: body.result},
                    json: true,
                    url: queueURL
                };
    
                request(queueOptions, function(err, response, body){
                    if(err){
                        console.error('error parsing json: ', err);
                        throw err;
                        res.sendStatus(500);
                    } else{
                        console.log(JSON.stringify(body));
                        console.log("Operation succesfully completed");
                        res.json({
                            "fulfillmentText": "A new account for " + req.body.queryResult.parameters.firstName + " has been created."
                        });
                    }
                });
                
            });

        });
    }
    
});

//used for adding new employees to DB with postman
router.post("/newuser", function(req, res, next){
    var user = new UserInfo(req.body);
    user.save(function(err, user){
        if(err) return next(err);
        res.status(201);
        res.json(user);
    });
});

module.exports = router;