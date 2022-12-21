const controller = require("../controllers/admins");
const AuthController = require("../controllers/auth");
const validate = require("../controllers/admin.validate");

const express = require("express");
const router = express.Router();
const trimRequest = require("trim-request");
const path = require("path");
const passport = require("passport");
const requireAuth = passport.authenticate("jwt", {
  session: false,
});
// router.post(
//   "/startCampaign/:id",
//   requireAuth,
//   AuthController.roleAuthorization(["admin"]),
//   trimRequest.all,
//   validate.startCampaign,
//   controller.startCampaign
// );
// router.post(
//   "/startCampaignSearch/:id",
//   requireAuth,
//   AuthController.roleAuthorization(["admin"]),
//   trimRequest.all,
//   validate.startCampaign,
//   controller.startCampaignSearch
// );

router.get(
  "/approve/user/:email",
  trimRequest.all,
  controller.approveUser,
);

router.get(
  "/reject/user/:email",
  trimRequest.all,
  controller.rejectUser,
);

router.get(
  "/make/admin/user/:email",
  trimRequest.all,
  controller.makeUserAdmin,
);

router.post(
  "/fetchNotaries/:id",
  trimRequest.all,
  controller.fetchNotaries,
);
router.post(
  "/fetchCustomers/:id",
  trimRequest.all,
  controller.fetchCustomers,
);
router.post(
  "/fetchSessions/:id",
  trimRequest.all,
  controller.fetchSessions,
);
router.post(
  "/deleteUser/:id",
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(["admin"]),
  controller.deleteUser,
);

module.exports = router;
