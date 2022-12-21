/* eslint-disable */

const utils = require("../middleware/utils");
const { matchedData } = require("express-validator");
const fs = require("fs");
const path = require("path");
const User = require("../models/user");
import { NotaryDataModel } from "../models/notarydata";
import { NewSessionModel } from "../models/newsessiondata";
import { DocumentModel } from "../models/documentsdata";
import { IdentityModel } from "../models/identitydata";
const UserAccess = require("../models/userAccess");
import emailer from "../middleware/emailer";
const SessionUserLogs = require("../models/sessionUserLogs");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const stripeTest = require("stripe")(process.env.STRIPE_SECRET_KEY_TEST);
import _ from "lodash";
/*********************
 * Private functions *
 *********************/
exports.adminTests = async (req, res) => {
  try {
    req = matchedData(req);
    console.log(req);
    res.status(201).json(req);
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.approveUser = async (req, res) => {
  try {
    const email = req.params && req.params.email;
    if (!email) {
      res.status(400).json({
        error: "Please provide email.",
      });
    }
    const user = await User.findOne({email});
    console.log(user);
    if (user) {
      if (!user.verified) {
        res.status(200).json({
          status: false,
          message: "Email is not verified yet by this user.",
        });
      } else if (user.approve && user.approve === "inactive") {
        user.approve = "active";
        user.save();
        emailer.sendNotaryApprovalEmailMessage(user);
        res.status(200).json({
          status: true,
          message: "User approved successfully.",
        });
      } else {
        res.status(200).json({
          status: false,
          message: "User with provided email is already approved.",
        });
      }
    } else {
      res.status(200).json({
        status: false,
        message: "User with the provided email does not exists, please check email and try again.",
      });
    }

  } catch (error) {
    utils.handleError(res, error);
  }
};

// Reject user
exports.rejectUser = async (req, res) => {
  try {
    const email = req.params && req.params.email;
    if (!email) {
      res.status(400).json({
        error: "Please provide email.",
      });
    }
    const user = await User.findOne({email});
    console.log(user);
    if (user) {
      if (!user.verified) {
        res.status(200).json({
          status: false,
          message: "Email is not verified yet by this user.",
        });
      } else if (user.approve && user.approve !== "inactive") {
        user.approve = "inactive";
        user.save();
        res.status(200).json({
          status: true,
          message: "User rejected successfully.",
        });
      } else {
        res.status(200).json({
          status: false,
          message: "User with provided email is already rejected.",
        });
      }
    } else {
      res.status(200).json({
        status: false,
        message: "User with the provided email does not exists, please check email and try again.",
      });
    }

  } catch (error) {
    utils.handleError(res, error);
  }
};

// Make user admin
exports.makeUserAdmin = async (req, res) => {
  try {
    const email = req.params && req.params.email;
    if (!email) {
      res.status(400).json({
        error: "Please provide email.",
      });
    }
    const user = await User.findOne({email});
    console.log(user);
    if (user) {
      if (!user.verified) {
        res.status(200).json({
          status: false,
          message: "Email is not verified yet by this user.",
        });
      } else if (user.approve && user.approve === "inactive") {
        res.status(200).json({
          status: false,
          message: "User is not approved yet, please approve it first.",
        });
      } else if (user.role !== "admin") {
        user.role = "admin";
        user.save();
        res.status(200).json({
          status: true,
          message: "User is now admin.",
        });
      } else {
        res.status(200).json({
          status: false,
          message: "User with provided email is already an admin.",
        });
      }
    } else {
      res.status(200).json({
        status: false,
        message: "User with the provided email does not exists, please check email and try again.",
      });
    }

  } catch (error) {
    utils.handleError(res, error);
  }
};

// Fetch notaries
exports.fetchNotaries = async (req, res) => {
  try {
    const email = req.body.email;
    const showReadyForApprovalNotaries = req.body.showReadyForApprovalNotaries || false;
    let notaries = null;
    let notaryQuery = {
      role: "notary",
    };
    if (showReadyForApprovalNotaries) {
      notaryQuery.localOnboardingFilledFlag = true;
      notaryQuery.approve = {"$ne": "active"};
    }
    if (email === null || email === "") {
      console.log("notaryQuery", notaryQuery);
      notaries = await User.paginate(notaryQuery, { page: req.params.id, limit: 10, sort: { createdAt: -1 } });
    } else {
      // email = email.replace(/\+/i, '\+')
      notaryQuery.email = { $regex: email, $options: "i"};
      // console.log("email", email)
      notaries = await User.paginate(notaryQuery, { page: req.params.id, limit: 10, sort: { createdAt: -1 } });
    }
    let notariesData =  [];
    if (notaries) {
      for (const notary of notaries.docs) {
        const notaryDocuments = await NotaryDataModel.findOne({ userId: notary._id });
        let notatyDataDocument = false;
        let onBoarding = false;
        notatyDataDocument = notaryDocuments;

        if (notaryDocuments && notary.approve !== "active") {
          if (notaryDocuments.commissionExpiresOn !== "" &&
          notaryDocuments.commissionExpiresOn !== undefined &&
            notary.state !== "" &&
            notary.state !== undefined &&
            notary.commissionNumber !== "" &&
            notary.commissionNumber !== undefined &&
            notaryDocuments.notaryCopyOfCommissionLetterName !== "" &&
            notaryDocuments.notaryCopyOfCommissionLetterName !== undefined &&
            notaryDocuments.stripeAccountName !== "" &&
            notaryDocuments.stripeAccountName !== undefined
          ) {
            let stripeToUse;
            if (notary.testingacc) {
              stripeToUse = stripeTest;
            } else {
              stripeToUse = stripe;
            }
            const account = await stripeToUse.accounts.retrieve(notaryDocuments.stripeAccountName);
            notaryDocuments.stripeFullAccountDetails = account;
            if (notaryDocuments.stripeFullAccountDetails &&
              notaryDocuments.stripeFullAccountDetails.requirements &&
              notaryDocuments.stripeFullAccountDetails.requirements.errors &&
              notaryDocuments.stripeFullAccountDetails.requirements.errors.length > 0) {
              onBoarding = false;
            } else {
              onBoarding = true;
            }
            if (onBoarding && notaryDocuments.stripeFullAccountDetails &&
              notaryDocuments.stripeFullAccountDetails.capabilities &&
              notaryDocuments.stripeFullAccountDetails.capabilities.transfers !== "active") {
              onBoarding = false;
            }
          }
        }
        if (notary.approve === "active") {
          onBoarding = true;
        }
        const notarySession = await UserAccess.findOne({ email: notary.email }).sort({ createdAt: -1 }).limit(1);
        let notatyDataSession = false;
        if (notarySession) {
          notatyDataSession = notarySession;
        }
        notariesData.push({
          notary,
          onBoarding,
          notatyDataDocument,
          notatyDataSession,
        });
      }

      const  paginate = {totalDocs: notaries.totalDocs,
                        offset: notaries.offset,
                        limit: notaries.limit,
                        totalPages: notaries.totalPages,
                        page: notaries.page,
                        pagingCounter: notaries.pagingCounter,
                        hasPrevPage: notaries.hasPrevPage,
                        hasNextPage: notaries.hasNextPage,
                        prevPage: notaries.prevPage,
                        nextPage: notaries.nextPage,
                      };

      res.status(200).json({
        notaryData: notariesData,
        paginate: paginate,
      });
    } else {
      res.status(200).json({
        notaryData: [],
      });
    }

  } catch (error) {
    utils.handleError(res, error);
  }
};
// Fetch Customers
exports.fetchCustomers = async (req, res) => {
  try {
    const email = req.body.email;
    let customers = null;
    if (email === null || email === "") {
      customers = await User.paginate({role: "customer"}, { page: req.params.id, limit: 10, sort: { createdAt: -1 } });
    } else {
      customers = await User.paginate({ email: { $regex: req.body.email, $options: "i"}, role: "customer" }, { page: req.params.id, limit: 10, sort: { createdAt: -1 } });
    }

    let customersData =  [];
    if (customers) {
      for (const cust of customers.docs) {
        customersData.push({cust});
      }

      const  paginate = {totalDocs: customers.totalDocs,
                        offset: customers.offset,
                        limit: customers.limit,
                        totalPages: customers.totalPages,
                        page: customers.page,
                        pagingCounter: customers.pagingCounter,
                        hasPrevPage: customers.hasPrevPage,
                        hasNextPage: customers.hasNextPage,
                        prevPage: customers.prevPage,
                        nextPage: customers.nextPage,
                      };

      res.status(200).json({
        customersData: customersData,
        paginate: paginate,
      });
    } else {
      res.status(200).json({
        customersData: [],
      });
    }

  } catch (error) {
    utils.handleError(res, error);
  }
};
// Fetch Sessions
exports.fetchSessions = async (req, res) => {
  try {
    const SESSION_TIMEOUT_IN_MINUTES = 30;
    const sessions = await NewSessionModel.paginate({}, { page: req.params.id, limit: 10, sort: { createdAt: -1 } });
    const sessionData = [];
    const allAdditionalSignerEmails = [];
    let sessionIdentityDocsKeyed = {};
    let allSessionIds = _.map(sessions.docs, "_id");
    for (const item of sessions.docs) {
      if (item.multiSignerList) {
        _.map(item.multiSignerList, (multiSignerDoc) => {
          if (multiSignerDoc.email) {
            allAdditionalSignerEmails.push(multiSignerDoc.email);
          }
        });
      }
    }
    let additionalSignerEmailUserDocMap = {};
    if (allAdditionalSignerEmails.length) {
      const allAdditionalSignerUserDocs = await User.find({
        "email": {"$in": allAdditionalSignerEmails},
      });
      additionalSignerEmailUserDocMap = _.keyBy(allAdditionalSignerUserDocs, "email");
    }
    const sessionIdentityDocs = await IdentityModel.find({
      "sessionid": {"$in": allSessionIds},
    });
    sessionIdentityDocsKeyed = _.groupBy(sessionIdentityDocs, "sessionid");
    for (const session of sessions.docs) {
      let finalDocument;
      const customer = await User.findOne({ _id: session.userId });
      const notaryUser = await User.findOne({ _id: session.notaryUserId });
      const document = await DocumentModel.find({ sessionid: session._id, documentCategory: "initial_document" });
      const identityData = await IdentityModel.findOne({ sessionid: session._id });
      let finalDocumentId = session.finalDocumentId;
      let videoDataId = session.videoFileDocumentId;
      if (session.paid === false) {
        finalDocumentId = "";
        videoDataId = "";
      }
      if (session.status === "complete" && finalDocumentId) {
        finalDocument = await DocumentModel.find({ sessionid: session._id, documentCategory: "final_document_with_dc" });
      } else {
        finalDocument = false;
      }
      let videoData;
      if (session.status === "complete" && videoDataId) {
        videoData = await DocumentModel.findOne({ _id: videoDataId });
      } else {
        videoData = false;
      }
      if (session.sessionActive) {
        const diff = new Date().valueOf() - session.sessionActiveFrom.valueOf();
        const diffMinutes = diff / (60 * 1000);
        if (diffMinutes > SESSION_TIMEOUT_IN_MINUTES) {
          session.sessionActive = null;
          session.sessionActiveFrom = null;
          // delete session.sessionActive
          // delete session.sessionActiveFrom
          session.save();
        }
      }
      const additionalSignerIdentyDocs = [];
      const allNotaryIdentities = sessionIdentityDocsKeyed[session._id] || [];
      _.map(session.multiSignerList, (multiSignerDoc) => {
        const userDoc = additionalSignerEmailUserDocMap[multiSignerDoc.email];
        let identityDocFound = false;
        if (userDoc) {
          _.map(allNotaryIdentities, (tempIdentityDoc) => {
            if (String(tempIdentityDoc.userId) === String(userDoc._id)) {
              additionalSignerIdentyDocs.push(tempIdentityDoc);
              identityDocFound = true;
            }
          });
        }
        if (!identityDocFound) {
          additionalSignerIdentyDocs.push(multiSignerDoc);
        }
      });
      const sessionJoinedUserLog = await SessionUserLogs.findOne({
        sessionid: session._id,
        actionType : "join_session",
      });
      let sessionStartedTime = false;
      if (sessionJoinedUserLog) {
        sessionStartedTime = sessionJoinedUserLog.createdAt;
      }
      const idcardState = identityData?.cardAPIResponseDoc?.platformresponse?.response?.[0]?.cardresult?.[0]?.documentaddress?.[0]?.state?.[0];
      const idcardExpiry = identityData?.cardAPIResponseDoc?.platformresponse?.response?.[0]?.cardresult?.[0]?.documentinformation?.[0]?.expirationdate?.[0];
      sessionData.push({
        session,
        signer: (customer && customer.name) ? customer.name : (customer && customer.email ? customer.email : ""),
        notaryUserName: (notaryUser && notaryUser.name) ? notaryUser.name : "",
        notaryUserEmail: (notaryUser && notaryUser.email) ? notaryUser.email : "",
        inviteLink: `${process.env.FRONT_URL}/business/prepare_doc/${session._id}`,
        signerEmail: (customer) ? customer.email : "",
        documentName: (document && document[0]) ? document[0].name : "N/A",
        documentUrl: (document && document[0]) ? document[0].url : "#",
        document: document,
        finalDocument: finalDocument,
        identityData,
        videoData,
        additionalSignerIdentyDocs,
        sessionStartedTime,
        idcardState,
        idcardExpiry,
      });
    }

    const  paginate = {totalDocs: sessions.totalDocs,
                        offset: sessions.offset,
                        limit: sessions.limit,
                        totalPages: sessions.totalPages,
                        page: sessions.page,
                        pagingCounter: sessions.pagingCounter,
                        hasPrevPage: sessions.hasPrevPage,
                        hasNextPage: sessions.hasNextPage,
                        prevPage: sessions.prevPage,
                        nextPage: sessions.nextPage,
                      };

    res.status(200).json({ sessionData, paginate});

  } catch (error) {
    utils.handleError(res, error);
  }
};
// Delete User
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id });
    if (user) {
      await user.remove();
      res.status(200).json({
        message: "User successfully removed.",
      });
    } else {
      res.status(400).json({
        message: "Something went wrong",
      });
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};
