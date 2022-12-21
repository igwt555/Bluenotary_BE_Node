var controller = require("../controllers/auth");
var validate = require("../controllers/auth.validate");
var express = require("express");
var router = express.Router();
require("../config/passport");
var passport = require("passport");
var requireAuth = passport.authenticate("jwt", {
  session: false,
});
var trimRequest = require("trim-request");
/*
 * Auth routes
 */
/*
 * Register route
 */
router.post(
  "/register",
  trimRequest.all,
  validate.register,
  controller.register,
);
/*
 * Verify route
 */
router.get("/verify", trimRequest.all, validate.verify, controller.verify);
/*
 * Re-Verify route
 */
router.post("/reverify", requireAuth, trimRequest.all, controller.reverify);
/*
 * Forgot password route
 */
router.post(
  "/forgot",
  trimRequest.all,
  validate.forgotPassword,
  controller.forgotPassword,
);

/*
 * Resend Verification Email route
 */
router.post(
  "/resendVerifyEmail",
  trimRequest.all,
  validate.forgotPassword,
  controller.resendVerifyEmail,
);
/*
 * Reset password route
 */
router.post(
  "/reset",
  trimRequest.all,
  validate.resetPassword,
  controller.resetPassword,
);
/*
 * Get new refresh token
 */
router.get(
  "/token",
  requireAuth,
  controller.roleAuthorization(["customer", "admin", "notary"]),
  trimRequest.all,
  controller.getRefreshToken,
);
/*
 * Update Customer Basic Details
 */
router.post(
  "/user-update",
  requireAuth,
  controller.roleAuthorization(["customer"]),
  trimRequest.all,
  validate.userUpdate,
  controller.userUpdate,
);
/*
 * Update password.
 */
router.post(
  "/update-password",
  requireAuth,
  trimRequest.all,
  validate.updatePassword,
  controller.updatePasswordRoute,
);
/*
 * Login route
 */
router.post("/login", trimRequest.all, validate.login, controller.login);
module.exports = router;
