
import aws from 'aws-sdk';
import multer from 'multer'
import multerS3 from 'multer-s3';
const controller = require('../controllers/api');
const validate = require('../controllers/apivalidate');
const AuthController = require('../controllers/auth');
const express = require('express');
const router = express.Router();
const passport = require('passport');
const requireAuth = passport.authenticate('jwt', {
  session: false
});
const trimRequest = require('trim-request');
const multer = require('multer');

aws.config.update({
  apiVersion: '2006-03-01',
  accessKeyId: process.env.AWSAccessKeyId,
  secretAccessKey: process.env.AWSSecretKey,
  region: process.env.AWSRegion
})

const s3 = new aws.S3()

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWSBucket,
    acl: 'public-read',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname })
    },
    key: (req, file, cb) => {
      cb(null, Date.now().toString() + file.originalname)
    }
  })
})

// const upload1 = multer({ storage: diskStorage });

router.post(
  '/uploadFiles',
  upload.single('file'),
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary', 'customer']),
  validate.uploadFile,
  controller.uploadFiles
);

router.post(
  '/notaryFileUpload',
  upload.single('file'),
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  // validate.notaryFileUpload,
  controller.notaryFileUpload
);

router.post(
  '/notaryCertificateUpload',
  upload.single('file'),
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  controller.notaryCertificatesUpload
);

router.post(
  '/notaryCopyOfComissionLetter',
  upload.single('file'),
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  controller.notaryCopyOfComissionLetter
);

router.post(
  '/pdfEditsFinalDocumentSave/:id',
  upload.single('file'),
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['customer', 'notary']),
  // validate.pdfEditsFinalDocumentSave,
  controller.pdfEditsFinalDocumentSave
);

router.post(
  '/pdfEditsVideoDocumentSave/:id',
  // upload.single('file'),
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['customer', 'notary']),
  controller.pdfEditsVideoDocumentSave
);

// Notary Invite Signer
router.post(
  '/invite-signer',
  upload.array('file', 20),
  // upload.single('file'),
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary', 'customer']),
  validate.validateNotaryInviteSigner,
  controller.notaryInviteSigner
);

router.post(
  '/customerFrontBackIdUpload',
  upload.single('file'),
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['customer']),
  validate.validateCustomerPhotoId,
  controller.uploadCustomerPhotoID
);
router.post(
  '/sealdata',
  upload.single('file'),
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary']),
  controller.saveSealFile
);
router.post(
  '/saveSignatureImageFile',
  upload.single('file'),
  trimRequest.all,
  requireAuth,
  // AuthController.roleAuthorization(['notary']),
  controller.saveSignatureImageFile
);
router.post(
  '/template-upload',
  upload.single('file'),
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary', 'customer']),
  controller.saveDocumentTemplate
);
router.post(
  '/notaryEmailLogoUpload',
  upload.single('file'),
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary', 'customer']),
  controller.notaryEmailLogoUpload
);
router.post(
  '/checkingPhotoIdRealTime',
  upload.single('file'),
  trimRequest.all,
  requireAuth,
  AuthController.roleAuthorization(['notary', 'customer']),
  validate.checkingPhotoIdRealTime,
  controller.checkingPhotoIdRealTime
);

module.exports = router;
