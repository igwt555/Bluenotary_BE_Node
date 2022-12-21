const controller = require('../controllers/business');
const AuthController = require('../controllers/auth');
import express from 'express';
const router = express.Router();
const trimRequest = require('trim-request');
const passport = require('passport');
const requireAuth = passport.authenticate('jwt', {
  session: false
});

router.post(
  '/checkout-session',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['customer']),
  controller.stripeBusinessCheckoutSession
);
router.post(
  '/upgrade-status',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['customer']),
  controller.stripeBuisnessSessionStatus
);
module.exports = router;
