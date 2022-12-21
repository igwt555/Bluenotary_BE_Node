const controller = require("../controllers/api");
const validate = require("../controllers/apivalidate");
const AuthController = require("../controllers/auth");
import express from "express";
const router = express.Router();
const trimRequest = require("trim-request");
const passport = require("passport");
const requireAuth = passport.authenticate("jwt", {
  session: false,
});
router.post(
  "/inviteBusinessNotary",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer"]),
  validate.inviteBusinessNotary,
  controller.inviteBusinessNotary,
);
router.post(
  "/removeCustomerNotaryLink",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer"]),
  validate.removeCustomerNotaryLink,
  controller.removeCustomerNotaryLink,
);
router.get(
  "/customerGetAllSettings",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer"]),
//   validate.customerGetAllSettings,
  controller.customerGetAllSettings,
);
router.get(
  "/fetchAllSelectableNotaries",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["customer"]),
//   validate.fetchAllSelectableNotaries,
  controller.fetchAllSelectableNotaries,
);
module.exports = router;
