const controller = require('../controllers/api');
const validate = require('../controllers/apivalidate');
const AuthController = require('../controllers/auth');
import express from 'express';
const router = express.Router();
const trimRequest = require('trim-request');
const passport = require('passport');
const requireAuth = passport.authenticate('jwt', {
  session: false
});
router.post(
  '/loads',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  // validate.sessionid,
  controller.loadsNotaryDetailData
);

router.post(
  '/detail',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  validate.saveNotaryDetailData,
  controller.saveNotaryDetailData
);

router.post(
  '/connectStripe',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  controller.connectStripe
);

router.post(
  '/sealdata',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  validate.sealdata,
  controller.saveSealData
);

router.post(
  '/notaryFileDelete',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  controller.notaryFileDelete
);

router.post(
  '/templateDelete',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary', 'customer']),
  validate.notaryTemplateDelete,
  controller.notaryTemplateDelete
);

router.post(
  '/notaryCertificateDelete',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  validate.notaryCertificateDelete,
  controller.notaryCertificateDelete
);

router.post(
  '/sessions',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  validate.validateNotarySessionLists,
  controller.fetchNotarySessions
);
router.post(
  '/checkout-session',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  controller.stripeCheckoutSession
);
router.post(
  '/upgrade-status',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  controller.stripeSessionStatus
);
router.post(
  '/document-templates',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary', 'customer']),
  controller.loadDocumentTemplates
);
router.post(
  '/templateOptions',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary', 'customer']),
  controller.templateOptions
);
router.post(
  '/templateUpdate',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary', 'customer']),
  validate.notaryTemplateUpdate,
  controller.notaryTemplateUpdate
);
router.post(
  '/templateFindOne',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary', 'customer']),
  validate.notaryTemplateFindOne,
  controller.notaryTemplateFindOne
);
router.post(
  '/templateUpdatePdfDroppedElements',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary', 'customer']),
  validate.notaryTemplateUpdatePdfDroppedElements,
  controller.notaryTemplateUpdatePdfDroppedElements
);
router.post(
  '/saveNotaryDataFields',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  // validate.notaryTemplateUpdatePdfDroppedElements,
  controller.saveNotaryDataFields
);
router.post(
  '/create-customer-portal-session',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  controller.createCustomerPortalSession
  // validate.notaryTemplateUpdatePdfDroppedElements,
);
router.post(
  '/update-email-custom-message',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary', 'customer']),
  controller.updateEmailCustomMessage
);
router.post(
  '/update-email-setting',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary', 'customer']),
  controller.updateEmailSetting
);
router.post(
  '/saveNotaryCustomCharges',
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  // validate.saveNotaryCustomCharges,
  controller.saveNotaryCustomCharges
);
module.exports = router;
