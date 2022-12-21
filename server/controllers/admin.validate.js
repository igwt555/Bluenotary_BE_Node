const { validationResult } = require("../middleware/utils");
const { check } = require("express-validator");
exports.startCampaign = [
  check("id").exists().withMessage("MISSING").not().isEmpty().withMessage("IS_EMPTY").trim(),
  (req, res, next) => {
    validationResult(req, res, next);
  },
];
exports.testCleaner = [
  check("email").exists().withMessage("MISSING").not().isEmpty().withMessage("IS_EMPTY").trim(),
  (req, res, next) => {
    validationResult(req, res, next);
  },
];
