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
                                    "name": info.firstName
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
        var employeeNumber = req.body.queryResult.outputContexts[0].parameters["employeeNumber.original"];

        UserInfo.findOne({employeeNumber: employeeNumber})
        .exec(function(err, info){
            if(err) return err;
            if(info){
                var originalAddress = info.address;
                var name = info.firstName + " " + info.lastName;
                console.log(originalAddress);
                console.log(name);

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
                        console.log("Job succesfully started");
                        }
                    });

                });

            }
        });

        //UserInfo.findOne({employeeNumber: employeeNumber})
        //.exec(function(err, info){
        //    info.address = addressChange;
        //        UserInfo.save(function(err, user){
        //            if(err) return err;
        //            res.status(201);
        //        });
        //});
  
    }

    //adds new employee job and queue
    if(req.body.queryResult.action === "newemployee"){
        var employeeInfo = {
            "employeeNumber": req.body.queryResult.outputContexts[0].parameters["empID.original"],
            "firstName": req.body.queryResult.outputContexts[0].parameters.firstName,
            "lastName": req.body.queryResult.outputContexts[0].parameters.lastName,
            "PIN": req.body.queryResult.outputContexts[0].parameters["PIN.original"],
            "address": req.body.queryResult.outputContexts[0].parameters.address
        };

        console.log(req.body.queryResult.outputContexts[0].parameters["empID.original"]);
        console.log(req.body.queryResult.outputContexts[0].parameters.firstName);
        console.log(req.body.queryResult.outputContexts[0].parameters.lastName);
        console.log(req.body.queryResult.outputContexts[0].parameters["PIN.original"]);
        console.log(req.body.queryResult.outputContexts[0].parameters.address);

        var newEmployee = new UserInfo(employeeInfo);
        newEmployee.save(function(err, user){
            if(err) return next(err);

            var firstName = req.body.queryResult.outputContexts[0].parameters.firstName;
            var lastName = req.body.queryResult.outputContexts[0].parameters.lastName;
            var PIN = req.body.queryResult.outputContexts[0].parameters["PIN.original"];
            var employeeNumber = req.body.queryResult.outputContexts[0].parameters["empID.original"];
            var address = req.body.queryResult.outputContexts[0].parameters.address;

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
                        Reference: firstName,
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

                var jobURL = "https://platform.uipath.com/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs";

                var jobData = {
                    startInfo: {
                        ReleaseKey: "4c08f67e-184a-4f5f-bbe1-8e5d77a2ea92",
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
                    } else{
                        console.log(JSON.stringify(body));
                        console.log("Operation succesfully completed");
                        res.json({
                            "fulfillmentText": firstName + " " + lastName + " has been added to the database."
                        });
                    }
                });

                request(jobOptions, function (err, res, body) {
                    if (err) {
                        console.error('error posting json: ', err);
                        throw err
                    } else {
                       console.log("Job succesfully started");
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