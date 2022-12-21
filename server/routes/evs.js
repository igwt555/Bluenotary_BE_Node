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
// const xmlparser = require("express-xml-bodyparser");
// router.post("/evs/fillwebhook", xmlparser({trim: false, explicitArray: false}), function(req, res, next) {
//   // req.body contains the parsed xml
//   // const body = req.body
//   // const data = req.data
//   console.log("FILEWEBHOOK INDEX 1 REQ!!", req);
//   console.log("FILEWEBHOOK INDEX 1 BODY!!", req.body);
//   // console.log('FILEWEBHOOK INDEX DATA!!', req.data)
//   res.status(200).json({
//     message: "Webhook passed",
//   });
// });
// router.post(
//   "/fillwebhook",
//   trimRequest.all,
// //   requireAuth,
// //   AuthController.roleAuthorization(["customer"]),
// //   validate.sessionidWithUserID,
//   controller.fillwebhook,
// );
router.put(
  "/fillwebhook",
  trimRequest.all,
//   requireAuth,
//   AuthController.roleAuthorization(["customer"]),
//   validate.sessionidWithUserID,
  controller.fillwebhookPUT,
);
module.exports = router;
