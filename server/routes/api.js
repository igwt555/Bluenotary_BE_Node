const controller = require("../controllers/api");
const validate = require("../controllers/apivalidate");
const AuthController = require("../controllers/auth");
const express = require("express");
const router = express.Router();

const trimRequest = require("trim-request");

router.get(
  "/v1/db-backup",
  //   requireAuth,
  //   AuthController.roleAuthorization(["admin"]),
  trimRequest.all,
  controller.db_backup,
);

module.exports = router;
