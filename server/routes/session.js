const controller = require("../controllers/api");
const validate = require("../controllers/apivalidate");
const AuthController = require("../controllers/auth");
const express = require("express");
const router = express.Router();
const trimRequest = require("trim-request");
const passport = require("passport");
const requireAuth = passport.authenticate("jwt", {
  session: false,
});
router.post(
  "/loads",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer"]),
  validate.sessionidWithUserID,
  controller.loadsSessionData,
);
// get Audit trail session
router.get(
  "/getAuditTrail/:id",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer", "notary", "admin"]),
  controller.getAuditTrail,
);
// archieve session
router.post(
  "/archieve",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer", "notary"]),
  validate.sessionid,
  controller.archieveSessionItem,
);
// unarchieve session
router.post(
  "/unarchieve",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer", "notary"]),
  validate.sessionid,
  controller.unarchieveSessionItem,
);
// delete session
router.post(
  "/delete",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer"]),
  validate.sessionidWithDocumentID,
  controller.deleteSessionItem,
);
// delete session document
router.post(
  "/documentDelete",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer"]),
  validate.sessionidWithDocumentID,
  controller.deleteSessionDocument,
);
router.post(
  "/personalData",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer"]),
  validate.savePersonalData,
  controller.savePersonalData,
);
router.post(
  "/load/personalData",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  validate.sessionid,
  controller.loadPersonalData,
);
router.post(
  "/load/sessiondata",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer"]),
  controller.sessiondata,
);
router.post(
  "/load/sessiondata/:id",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer"]),
  controller.sessiondatawithPagination,
);
router.post(
  "/createCustomer",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer"]),
  validate.savePersonalData,
  controller.createCustomer,
);
router.post(
  "/createCustomerForInviteSigner",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer", "notary"]),
  validate.createCustomerForInviteSigner,
  controller.createCustomerForInviteSigner,
);
router.post(
  "/repaymentForSession",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer"]),
  validate.repaymentForSession,
  controller.repaymentForSession,
);
router.get(
  "/fullSessionData/:id",
  trimRequest.all,
  requireAuth,
  // AuthController.roleAuthorization(["notary", "customer"]),
  controller.getOneSessionFullData,
);
router.post(
  "/savePDFEditingPage/:id",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  controller.savePDFEditingPage,
);
router.get(
  "/getConsumerPlusApiResponse/:id",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  controller.getConsumerPlusApiResponse,
);
router.get(
  "/getCustomerDetailsDuringSessionFlow/:id",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  controller.getCustomerDetailsDuringSessionFlow,
);
router.post(
  "/getCustomerDetailsAfterChecking/:id",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  controller.getCustomerDetailsAfterChecking,
);
router.post(
  "/verifyCustomerAnswersDuringSessionFlow/:id",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  validate.verifyCustomerAnswersDuringSessionFlow,
  controller.verifyCustomerAnswersDuringSessionFlow,
);
router.post(
  "/saveSessionData/:id",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  // validate.saveSessionData,
  controller.saveSessionData,
);
router.post(
  "/pickUpSession/:id",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  // validate.pickUpSession,
  controller.pickUpSession,
);

// set session stage/status
router.get(
  "/setSessionStageOrStatus/:id", // ?type=status|stage&value=anything
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  controller.setSessionStageOrStatus,
);

// get session stage/status
router.get(
  "/isValidSession/:id",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  controller.isValidSession,
);

router.get(
  "/expireSessionDocuments",
  trimRequest.all,
  controller.expireSessionDocuments,
);

router.post(
  "/addWitnessDuringSession",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  validate.addWitnessDuringSession,
  controller.addWitnessDuringSession,
);
router.get(
  "/getAllWitnessDetails",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  // validate.getAllWitnessDetails,
  controller.getAllWitnessDetails,
);
router.post(
  "/joinSessionAsWitness",
  trimRequest.all,
  requireAuth,
  // AuthController.roleAuthorization(["notary", "customer"]),
  validate.joinSessionAsWitness,
  controller.joinSessionAsWitness,
);
router.get(
  "/getAllSessionWitnesses/:id",
  trimRequest.all,
  requireAuth,
  // AuthController.roleAuthorization(["notary", "customer"]),
  // validate.getAllSessionWitnesses,
  controller.getAllSessionWitnesses,
);
router.post(
  "/removeSessionWitness",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  validate.removeSessionWitness,
  controller.removeSessionWitness,
);
router.post(
  "/doOpenCallForActiveSession",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  validate.doOpenCallForActiveSession,
  controller.doOpenCallForActiveSession,
);
router.post(
  "/saveDraftOfCurrentSession",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  validate.saveDraftOfCurrentSession,
  controller.saveDraftOfCurrentSession,
);
router.get(
  "/saveUserDetails",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["notary", "customer"]),
  controller.saveUserDetails,
);
module.exports = router;
