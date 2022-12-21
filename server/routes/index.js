const express = require("express");
const router = express.Router();
const xmlparser = require("express-xml-bodyparser");
const util = require("util");
import _ from "lodash";
import { IdentityModel } from "../models/identitydata";

router.post("/evs/fillwebhook", xmlparser({trim: false, explicitArray: false}), async function(req, res, next) {
  console.log(util.inspect(req.body, {showHidden: false, depth: null, colors: true}));
  const apiResponse = req.body;
  const customerReferenceNumber = apiResponse && apiResponse.platformresponse && apiResponse.platformresponse.transactiondetails &&
  apiResponse.platformresponse.transactiondetails[0] && apiResponse.platformresponse.transactiondetails[0].customerreference &&
  apiResponse.platformresponse.transactiondetails[0].customerreference[0] || false;
  console.log("customerReferenceNumber", customerReferenceNumber);
  if (!customerReferenceNumber) {
    console.log("customerReferenceNumber not found");
    return;
  }
  const responseDoc = apiResponse && apiResponse.platformresponse
                && apiResponse.platformresponse.response && apiResponse.platformresponse.response[0] || false;
  const newIdentityDataResponse = await IdentityModel.findOne({
    cardAPICustomerReferenceNumber: customerReferenceNumber,
  });
  console.log("newIdentityDataResponse", newIdentityDataResponse, {
    cardAPICustomerReferenceNumber: customerReferenceNumber,
  });
  if (!newIdentityDataResponse) {
    return;
  }
  const finalApiResponse = JSON.parse(JSON.stringify(apiResponse).replace(/\$/g, "temp"));

  newIdentityDataResponse.cardAPIResponseDoc = finalApiResponse;
  newIdentityDataResponse.save();
  res.status(200).json({
    message: "Webhook passed",
  });
});

// let os = require('os-utils');
router.use("/users", require("./users"));
router.use("/auth", require("./auth"));
router.use("/admins", require("./admins"));
router.use("/file", require("./file"));
router.use("/session", require("./session"));
router.use("/notary", require("./notary"));
router.use("/signatures", require("./signatures"));
router.use("/business", require("./business"));
router.use("/evs", require("./evs"));
router.use("/customer", require("./customer"));
router.get("/", function(req, res) {
  res.status(200).json("I am running");
});

router.use("*", function(req, res) {
  res.status(404).json({
    errors: {
      msg: "URL_NOT_FOUND",
    },
  });
});
module.exports = router;
