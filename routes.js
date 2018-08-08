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
    //looks for employee in DB based on employee ID
    if(req.body.queryResult.action === "employeeLookUp"){
            UserInfo.findOne({employeeNumber: req.body.queryResult.parameters.employeeNumber})
                .exec(function(err, info){
                    if(err) return next(err);
                    if(info){
                        res.json({
                            "fulfillmentText": "Thanks " + info.name + "! And to confirm your identity, can you please provide your verbal passcode?"
                        });
                    } else {
                        res.json({
                            //"fulfillmentText": "No account was found for: " + req.body.queryResult.parameters.employeeNumber + ".",
                            "followupEventInput": {
                                "name": "employee_not_found",
                                "languageCode": "en-US",
                            }
                        });
                    }
            });
    }

    if(req.body.queryResult.action === "employeeLookUp2"){
        var sessionID = uuidv1();
        UserInfo.findOne({employeeNumber: req.body.queryResult.parameters.employeeNumber})
            .exec(function(err, info){
                if(err) return next(err);
                if(info){
                    res.json({
                        "fulfillmentText": "Thanks " + info.name + "! And to confirm your identity, can you please provide your verbal passcode?",
                        "outputContexts": [
                            {
                              "name": "projects/dialogflow-demo-ca39a/agent/sessions/" + sessionID + "/contexts/employeeIdNotFound-followup",
                              "lifespanCount": 2,
                              "parameters": {
                                "name": info.name
                              }
                            }
                        ],
                        "followupEventInput": {
                            "name": "verbal_code",
                            "languageCode": "en-US"
                        }
                    });
                } else {
                    res.json({
                        "fulfillmentText": "No account was found for: " + req.body.queryResult.parameters.employeeNumber + ".",
                        "followupEventInput": {
                            "name": "employee_not_found",
                            "languageCode": "en-US",
                        }
                    });
                }
        });
}

    //checks if the given verbal code matches the one in the DB
    if(req.body.queryResult.action === "checkVerbalCode"){
        UserInfo.findOne({employeeNumber: req.body.queryResult.parameters.employeeNumber})
            .exec(function(err, info){
                if(err) return next(err);
                if(req.body.parameters.verbalCode === info.verbalCode){
                    res.json({
                        name: info.address
                    });
                } else {
                    res.json({
                        text: "Verbal code is incorrect"
                    });
                }
        });
    }

    //adds change to UiOrchestrator queue
    if(req.body.queryResult.action === "addQueue"){
    
        var addressChange = req.body.queryResult.actionparameters.address;
        var employeeNumber = req.body.queryResult.parameters.employeeNumber;
        console.log(addressChange);
        console.log(employeeNumber);

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
                        address: addressChange
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
                        text: "Your change of address is being processed."
                    });
                }
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