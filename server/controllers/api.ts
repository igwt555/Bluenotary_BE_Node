import aws from 'aws-sdk';
import { matchedData } from 'express-validator';
import _ from 'lodash';
import mongoose from 'mongoose'
import signer from 'node-signpdf';
import {plainAddPlaceholder} from 'node-signpdf/dist/helpers'
import path from 'path';
import { PDFDocument } from 'pdf-lib'
import emailer from '../middleware/emailer';
const http = require('http');
import * as utils from '../middleware/utils';
import { DocumentModel } from '../models/documentsdata';
import { IdentityModel } from '../models/identitydata';
import { NewSessionModel } from '../models/newsessiondata';
import { NotaryDataModel } from '../models/notarydata'
import { PDFDroppedElementsModel } from '../models/pdfdroppedelementsdata'
import { SessionDraftsModel } from '../models/sessiondraftsdata'
// import { SessionModel } from '../models/sessiondata'
import { SignaturesDataModel } from '../models/signaturesdata'
import { dbBackup } from '../service/DbBackup';
const uuid = require('uuid');
const fs = require('fs');
import { v4 as uuidV4 } from 'uuid';
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const request = require('request');
const util = require('util');
import dotenv from 'dotenv';
dotenv.config();
// import mongoose from 'mongoose'
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripeTest = require('stripe')(process.env.STRIPE_SECRET_KEY_TEST);
const User = require('../models/user');
const DocumentTemplate = require('../models/documentTemplate');
const SessionUserLogs = require('../models/sessionUserLogs');
const UserDetails = require('../models/userDetails');
const SessionWitness = require('../models/sessionWitness');
const UserNotaryRelation = require('../models/userNotaryRelation.js');
const WitnessModel = require('../models/witness');
const controller = require('./api');
const moment = require('moment');
const glob = require('glob')
const ffmpeg = require('fluent-ffmpeg');
const exec = util.promisify(require('child_process').exec);
const sharp = require('sharp')

// const PricingJson = require('../../../server/constants/pricing.json')
const PricingJson = {
  pricing: {
      'Arizona': {
          notaryFee: '10.00',
          serviceFee: '17.00',
          loan_signing: {
            notaryFee: '150.00',
            notaryFeeText: 'Loan Signing Notarization',
            serviceFee: '0.00'
          }
      },
      'Colorado': {
          notaryFee: '10.00',
          serviceFee: '17.00',
          loan_signing: {
            notaryFee: '150.00',
            notaryFeeText: 'Loan Signing Notarization',
            serviceFee: '0.00'
          }
      },
      'Maryland': {
          notaryFee: '4.00',
          serviceFee: '23.00',
          loan_signing: {
            notaryFee: '150.00',
            notaryFeeText: 'Loan Signing Notarization',
            serviceFee: '0.00'
          }
      },
      'New York': {
          notaryFee: '5.00',
          serviceFee: '22.00',
          loan_signing: {
            notaryFee: '150.00',
            notaryFeeText: 'Loan Signing Notarization',
            serviceFee: '0.00'
          }
      },
      'Others': {
          notaryFee: '25.00',
          serviceFee: '2.00',
          loan_signing: {
            notaryFee: '150.00',
            notaryFeeText: 'Loan Signing Notarization',
            serviceFee: '0.00'
          }
      }
  }
}
const AlertingService = require('../service/AlertingService')

const videoSavingDir = './tmp';

const SESSION_TIMEOUT_IN_MINUTES = 30
aws.config.update({
  apiVersion: '2006-03-01',
  accessKeyId: process.env.AWSAccessKeyId,
  secretAccessKey: process.env.AWSSecretKey,
  region: process.env.AWSRegion
})
console.log({
  apiVersion: '2006-03-01',
  accessKeyId: process.env.AWSAccessKeyId,
  secretAccessKey: process.env.AWSSecretKey,
  region: process.env.AWSRegion
})
const s3 = new aws.S3()

function getTimeZone(timezone) {
  let actualTimezone = 'Central';
  switch (timezone) {
    case '5.5':
      actualTimezone = 'GMT+05:30';
      break;
    case '-10':
      actualTimezone = 'Hawaii';
      break;
    case '-8':
      actualTimezone = 'Pacific';
      break;
    case '-7':
      actualTimezone = 'Mountain';
      break;
    case '-6':
      actualTimezone = 'Central';
      break;
    case '-5':
      actualTimezone = 'Eastern Time';
      break;
    case '-4':
      actualTimezone = 'Atlantic';
      break;
  }
  return actualTimezone;
};

function getTimeOfSessionFormatted(session) {
  let meetingDateFormatted
  if (session && session.meetingTimeZone) {
    const timezoneString = getTimeZone(session.meetingTimeZone);
    meetingDateFormatted = `${moment(session.meetingdate, 'YYYY-MM-DD HH:mm A').add(parseFloat(session.meetingTimeZone) * 60, 'minutes')
      .format('MMMM, Do YYYY')} at ${moment(session.meetingdate, 'YYYY-MM-DD HH:mm A')
      .format('hh:mmA')} ${timezoneString}`;
  } else {
    meetingDateFormatted = `${moment(session.meetingdate, 'YYYY-MM-DD HH:mm A')
    .utcOffset('-06:00')
    .format('MMMM, Do YYYY')} at ${moment(session.meetingdate, 'YYYY-MM-DD HH:mm A')
    .utcOffset('-06:00')
    .format('hh:mmA')} CST`
  }
  return meetingDateFormatted
};

exports.db_backup = async (req, res) => {
  try {
    req = matchedData(req);
    console.log('db_backup:', req)
    await dbBackup()
    res.status(200).json({ message: 'Database backup queued successfully.' });
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.uploadFiles = async (req, res) => {
  try {
    const file = req.file
    console.log('uploadFile 2:', file)
    console.log('req:', req.user)
    const user = req.user
    req = matchedData(req);
    console.log('uploadFile 1 :', req)

    if (file) {
      const session = await NewSessionModel.findOne({ _id: req.id });
      // Create Document First
      const uploadedDocument = new DocumentModel({
        sessionid: session._id,
        documentCategory: 'initial_document',
        name: file.originalname,
        url: file.location,
        type: file.mimetype,
        size: file.size,
        key: file.key,
        bucketName: file.bucket,
        uploadedBy: user.id,
        uploadedStage: 'initial_stage'
      });
      await uploadedDocument.save();
      if (!session.originalDocumentIds) {
        session.originalDocumentIds = []
      }
      session.originalDocumentId = uploadedDocument._id;
      session.originalDocumentIds.push(session.originalDocumentId)
      await session.save();

      res.status(200).json({session, url: file.location, document: [uploadedDocument] });
    } else {
      res.status(200).json({ error: true });
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.notaryFileUpload = async (req, res) => {
  try {
    const file = req.file
    const user = req.user
    const dcpassword = req.body.dcpassword || 'bnDCpwd21'
    req = matchedData(req);
    const dcMatchResponse = await checkIfDCPasswordIsValid(file.key, dcpassword)
    if (!dcMatchResponse) {
      return res.status(400).json({
        errors: {
          msg: 'Digital Certificate Password does not match with .p12 certificate'
        }
      })
    }
    if (file) {
      const notarydm = await NotaryDataModel.findOne({ userId: user._id })
      if (notarydm) {
        notarydm.certfileLocation = file.destination
        notarydm.certfileUrl = file.location
        notarydm.certfileSource = 'manual'
        notarydm.certfileAddedAt = new Date()
        notarydm.fileKey = file.key
        notarydm.certfilename = file.originalname
        notarydm.dcpassword = dcpassword
        await notarydm.save()
      } else {
        const newProxy = new NotaryDataModel({
          sessionid: req.id,
          userId: user._id,
          email: user.email,
          certfileLocation: file.destination,
          certfileUrl: file.location,
          certfileSource: 'manual',
          certfileAddedAt: new Date(),
          certfilename: file.originalname,
          fileKey: file.key,
          dcpassword
        })
        await newProxy.save()
      }
      await NotaryDataModel.find({ userId: user._id })
      res.status(200).json({
        message: 'Certificate uploaded successfully.'
      });
    } else {
      res.status(200).json({ error: true });
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.notaryFileDelete = async (req, res) => {
  try {
    const user = req.user
    req = matchedData(req);
    const notarydm = await NotaryDataModel.findOne({ userId: user._id })
    if (notarydm) {
      const params = {
        Bucket: process.env.AWSBucket,
        Key: notarydm.fileKey
      }

      try {
        await s3.headObject(params).promise()
        console.log('File Found in S3')
        try {
          await s3.deleteObject(params).promise()
          console.log('file deleted Successfully')
        } catch (err) {
          console.log('ERROR in file Deleting : ' + JSON.stringify(err))
        }
      } catch (err) {
        console.log('File not Found ERROR : ' + err)
      }
      notarydm.certfileLocation = null
      notarydm.certfileUrl = null
      notarydm.certfileSource = null
      notarydm.certfileAddedAt = null
      notarydm.fileKey = null
      notarydm.certfilename = null
      await notarydm.save()
    }
    res.status(200).json({
      message: 'Certificate successfully removed.'
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.notaryCertificatesUpload = async (req, res) => {
  try {
    const file = req.file
    const user = req.user
    req = matchedData(req);
    if (file) {
      const notarydm = await NotaryDataModel.findOne({ userId: user._id })
      if (notarydm) {
        notarydm.notaryCertificates.push({
          name: file.originalname,
          url: file.location,
          key: file.key
        });
        await notarydm.save()
      } else {
        const newProxy = new NotaryDataModel({
          sessionid: req.id,
          notaryCertificates: [{
            name: file.originalname,
            url: file.location,
            key: file.key
          }],
          userId: user._id,
          email: user.email,
          dcpassword: 'bnDCpwd21'
        })
        await newProxy.save()
      }
      await NotaryDataModel.find({ userId: user._id })
      res.status(200).json({
        message: 'Certificate uploaded successfully.'
      });
    } else {
      res.status(200).json({ error: true });
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.notaryCopyOfComissionLetter = async (req, res) => {
  try {
    const file = req.file;
    const user = req.user;
    req = matchedData(req);
    if (file) {
      const notarydm = await NotaryDataModel.findOne({ userId: user._id });
      if (notarydm) {
        notarydm.notaryCopyOfCommissionLetterName = file.originalname;
        notarydm.notaryCopyOfCommissionLetterUrl = file.location;
        notarydm.notaryCopyOfCommissionLetterKey = file.key;
        await notarydm.save();
      } else {
        const newProxy = new NotaryDataModel({
          notaryCopyOfCommissionLetterName: file.originalname,
          notaryCopyOfCommissionLetterUrl: file.location,
          notaryCopyOfCommissionLetterKey: file.key,
          userId: user._id,
          email: user.email,
          dcpassword: 'bnDCpwd21'
        });
        await newProxy.save();
      }
      await NotaryDataModel.find({ userId: user._id });
      res.status(200).json({
        message: 'Copy of Commission Letter uploaded successfully.'
      });
    } else {
      res.status(200).json({ error: true });
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.notaryCertificateDelete = async (req, res) => {
  try {
    const user = req.user
    req = matchedData(req);
    const data = req.data;
    const notarydm = await NotaryDataModel.findOne({ userId: user._id })
    if (notarydm) {
      const params = {
        Bucket: process.env.AWSBucket,
        Key: data.key
      }

      try {
        await s3.headObject(params).promise()
        console.log('File Found in S3')
        try {
          await s3.deleteObject(params).promise()
          console.log('file deleted Successfully')
        } catch (err) {
          console.log('ERROR in file Deleting : ' + JSON.stringify(err))
        }
      } catch (err) {
        console.log('File not Found ERROR : ' + err)
      }
      const certificates = notarydm.notaryCertificates.filter((item) => item.key !== data.key);
      notarydm.notaryCertificates = certificates;
      notarydm.save();
    }
    res.status(200).json({
      message: 'Notary certificate successfully removed.'
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.saveNotaryDataFields = async (req, res) => {
  try {
    const user = req.user
    console.log(req.data)
    console.log(req.params)
    console.log(req.body)
    const body = req.body;
    const notarydm = await NotaryDataModel.findOne({ userId: user._id })
    if (notarydm) {
      if (body.dcpassword) {
        const dcMatchResponse = await checkIfDCPasswordIsValid(notarydm.fileKey, body.dcpassword)
        console.log('dcMatchResponse', dcMatchResponse)
        if (!dcMatchResponse) {
          return res.status(400).json({
            errors: {
              msg: 'Digital Certificate Password does not match with .p12 certificate'
            }
          })
        }
        notarydm.dcpassword = body.dcpassword;
      }
      notarydm.save();
    } else {
      return res.status(400).json({
        errors: {
          msg: 'Please save Digital Certificate first, before saving the password'
        }
      })
    }
    res.status(200).json({
      message: 'Notary certificate Password Updated.'
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.loadsSessionData = async (req, res) => {
  try {
    const user = req.user
    console.log('req.userId before' , req.userId);
    req = matchedData(req);
    let document = null;
    let sessions = null;
    if (req.sessionId === 'new') {
      console.log('req.userId' , req.userId);
      // create new session
      sessions =  new NewSessionModel({
        sessionid: uuidV4(),
        userId: req.userId,
        // sessionCode: (Math.random() + 1).toString(36).substring(7).toUpperCase(),
        currentStage: 'initial_stage',
        status: 'unsigned',
        testingAccSession: user.testingacc ? true : false,
        stagesHistory: [{
            stageName: 'Session created',
            stageDate: new Date()
        }]
      });
      await sessions.save();
    } else {
      sessions = await NewSessionModel.findOne({ _id: req.sessionId });
    }

    if (sessions) {
      document = await DocumentModel.find({ sessionid: sessions._id });
    }
    let notaryUserDoc
    if (sessions.notaryUserId) {
      notaryUserDoc = await User.findOne({_id: sessions.notaryUserId})
    }

    res.status(200).json({session: sessions, document, notaryUserDoc});

  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.loadsNotaryDetailData = async (req, res) => {
  try {
    const user = req.user
    const dontGetStripe = req.body.dontGetStripe || false;
    req = matchedData(req);
    const sessions = JSON.parse(JSON.stringify(await NotaryDataModel.findOne({ userId: user._id })))
    sessions.stripeAccountDetails = {}
    const notarydm = await NotaryDataModel.findOne({ userId: user._id })
    // console.log('notarydm', notarydm)
    let stripeToUse;
    if (user.testingacc) {
      stripeToUse = stripeTest
    } else {
      stripeToUse = stripe
    }
    if (notarydm && notarydm.stripeAccountName && !dontGetStripe) {
      const account = await stripeToUse.accounts.retrieve(
        notarydm.stripeAccountName
      );
      if (!notarydm.stripeAccountLoginLink) {
        try {
          const stripeResponse = await stripeToUse.accounts.createLoginLink(
            notarydm.stripeAccountName
          );
          if (stripeResponse) {
            notarydm.stripeAccountLoginLink = stripeResponse.url;
            await notarydm.save();
          }
        } catch (error) {
          console.log(error)
        }
      }
      sessions.stripeAccountDetails = notarydm
      sessions.stripeFullAccountDetails = account
    }
    // console.log('sessions.stripeAccountDetails')
    // console.log(sessions.stripeAccountDetails)
    res.status(200).json(sessions);

  } catch (error) {
    utils.handleError(res, error);
  }
};

const seedDocumentTemplates = async (user) => {
  const docs = require('../constants/templates.json')
  const processing = await Promise.all(_.map(docs.templates, async (document) => {
    const template = path.resolve(document.path);
    if (!fs.existsSync(template)) {
      return false;
    }
    const fileContent = fs.readFileSync(template);
    const params = {
      Bucket: process.env.AWSBucket,
      Key: document.key,
      Body: fileContent,
      ACL: 'public-read'
    };
    try {
      const documentData = await s3.upload(params).promise();
      if (documentData) {
        const temp = new DocumentTemplate({
          type: 'predefined',
          name: document.name,
          documentUrl: documentData.Location,
          key: documentData.Key,
          bucketname: documentData.Bucket,
          uploadedBy: user._id
        });
        await temp.save();
      }
    } catch (err) {
      console.log(err);
    }
    return true;
  }));
  return processing;
};

exports.loadDocumentTemplates = async (req, res) => {
  try {
    const user = req.user;
    req = matchedData(req);
    let templates = await DocumentTemplate.find({uploadedBy: user._id}).sort({ createdAt: -1 });
    if (!templates.length) {
      await seedDocumentTemplates(user);
      templates = await DocumentTemplate.find({ uploadedBy: user._id }).sort({ createdAt: -1 });
    }
    res.status(200).json(templates);

  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.templateOptions = async (req, res) => {
  try {
    const user = req.user;
    req = matchedData(req);
    let templates = await DocumentTemplate.find({uploadedBy: user._id}).sort({ createdAt: -1 });
    if (!templates.length) {
      await seedDocumentTemplates(user);
      templates = await DocumentTemplate.find({ uploadedBy: user._id }).sort({ createdAt: -1 });
    }
    res.status(200).json(templates);

  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.notaryTemplateFindOne = async (req, res) => {
  try {
    const user = req.user;
    req = matchedData(req);
    const template = await DocumentTemplate.findOne({ _id: req.templateId });
    const notaryDatasDoc = await NotaryDataModel.findOne({ userId: user.id })
    const pdfDroppedElementDatas = await PDFDroppedElementsModel.findOne({ templateid: req.templateId });
    res.status(200).json({
      template,
      notaryDatasDoc,
      pdfDroppedElementDatas
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};

// pdfdroppedelements

exports.notaryTemplateUpdatePdfDroppedElements = async (req, res) => {
  try {
    let droppedElements = req.body && req.body.droppedElements || [];
    req = matchedData(req);
    const template = await DocumentTemplate.findOne({ _id: req.templateId });
    if (!template) {
      return res.status(404).json({
        error: 'Template Doc Not Found'
      });
    }
    let pdfDroppedElementsDoc = await PDFDroppedElementsModel.findOne({ templateid: req.templateId });
    if (!pdfDroppedElementsDoc) {
      pdfDroppedElementsDoc = new PDFDroppedElementsModel({ templateid: req.templateId })
    }
    console.log('droppedElements', droppedElements)
    if (_.isString(droppedElements)) {
      droppedElements = JSON.parse(droppedElements);
    }
    pdfDroppedElementsDoc.droppedElements = droppedElements
    await pdfDroppedElementsDoc.save()
    res.status(200).json({
      message: 'Template fields successfully updated.'
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.notaryTemplateUpdate = async (req, res) => {
  try {
    req = matchedData(req);
    const template = await DocumentTemplate.findOne({ _id: req.templateId });
    if (template) {
      template.name = req.templateName;
      await template.save();
    }
    res.status(200).json({
      message: 'Template successfully updated.',
      reqs: req
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.notaryTemplateDelete = async (req, res) => {
  try {
    req = matchedData(req);
    const template = await DocumentTemplate.findOne({ _id: req.templateId });
    if (template) {
      const params = {
        Bucket: process.env.AWSBucket,
        Key: template.key
      }
      console.log(params);
      try {
        await s3.headObject(params).promise()
        console.log('File Found in S3')
        try {
          await s3.deleteObject(params).promise()
          console.log('file deleted Successfully')
        } catch (err) {
          console.log('ERROR in file Deleting : ' + JSON.stringify(err))
        }
      } catch (err) {
        console.log('File not Found ERROR : ' + err)
      }
      await template.remove();
    }
    res.status(200).json({
      message: 'Template successfully removed.'
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.saveSealData = async (req, res) => {
  const user = req.user
  req = matchedData(req);
  const isExisting = await NotaryDataModel.exists({
    userId: user._id
  })
  if (!isExisting) {
    const newProxy = new NotaryDataModel({
      sealdata: req.base64,
      sealfilename: req.filename,
      userId: user._id,
      email: user.email,
      dcpassword: 'bnDCpwd21'
    })
    await newProxy.save()
    res.status(200).json({ message: 'Seal image uploaded successfully.' });
  } else {
    const newProxy = await NotaryDataModel.findOne({ userId: user._id })
    newProxy.sealdata = req.base64
    newProxy.sealfilename = req.filename
    newProxy.userId = user._id
    newProxy.email = user.email
    await newProxy.save()
    res.status(200).json({ message: 'Seal image uploaded successfully.' });
  }
}
exports.saveDocumentTemplate = async (req, res) => {
  const user = req.user;
  const file = req.file;
  req = matchedData(req);
  const template = new DocumentTemplate({
    type: 'custom',
    documentUrl: file.location,
    name: file.key,
    key: file.key,
    bucketname: file.bucket,
    uploadedBy: user._id
  });
  await template.save();
  res.status(200).json({ message: 'Template successfully saved.' });
}
exports.saveSealFile = async (req, res) => {
  const user = req.user;
  const file = req.file;
  req = matchedData(req);
  const isExisting = await NotaryDataModel.exists({
    userId: user._id
  })
  if (!isExisting) {
    const newProxy = new NotaryDataModel({
      sealdata: file.location,
      sealfilename: file.originalname,
      userId: user._id,
      email: user.email,
      dcpassword: 'bnDCpwd21'
    })
    await newProxy.save()
    res.status(200).json({ message: 'Seal image uploaded successfully.', file: file.location });
  } else {
    const newProxy = await NotaryDataModel.findOne({ userId: user._id })
    newProxy.sealdata = file.location;
    newProxy.sealfilename = file.originalname;
    newProxy.userId = user._id
    newProxy.email = user.email
    await newProxy.save()
    res.status(200).json({ message: 'Seal image uploaded successfully.', file: file.location });
  }
}
exports.saveNotaryDetailData = async (req, res) => {
  try {

    const user = req.user;
    req = matchedData(req);
    const data = req.data;
    console.log('Notary controller api ', user, data);

    let email = user.email;
    let sealData;
    const {spawn} = require('child_process');
    const template = path.resolve('./public/templates/' + data.state + '.jpg');
    const python = spawn('python3', [
      path.resolve('./scripts/alter_seal_template.py'),
      data.state,
      user.name,
      data.commissionNumber,
      data.commissionExpiresOn,
      template
    ]);
    await new Promise( (resolve) => {
      python.on('close', resolve)
    })
    const sealFile = path.resolve('./public/templates/seal-' + data.commissionNumber + '.jpg');
    const fileContent = fs.readFileSync(sealFile);
    const params = {
      Bucket: process.env.AWSBucket,
      Key: Date.now().toString() + 'seal-' + data.commissionNumber + '.jpg',
      Body: fileContent,
      ACL: 'public-read'
    };
    try {
      sealData = await s3.upload(params).promise()
      fs.unlinkSync(sealFile);
    } catch (err) {
      console.log(err)
    }
    if (sealData) {
      if (data.email && data.email.length) {
        email = data.email;
      }
      const isExisting = await NotaryDataModel.exists({
        userId: user._id
      });
      console.log('notary data :', isExisting);
      const notaryUser = await User.findOne({_id: user._id});
      if (notaryUser) {
        notaryUser.first_name = data.first_name;
        notaryUser.last_name = data.last_name;
        notaryUser.name = data.name;
        notaryUser.commissionNumber = data.commissionNumber;
        notaryUser.state = data.state;
        notaryUser.email = data.email;
        // if (notaryUser.commissionNumber && notaryUser.state &&
        // data.commissionExpiresOn && notaryUser.approve !== 'active') {
        //   notaryUser.approve = 'active'
        // }
        await notaryUser.save();
      }
      console.log('notaryUser spi.ts 643', notaryUser);

      if (!isExisting) {
        const newProxy = new NotaryDataModel({
          commissionExpiresOn: data.commissionExpiresOn,
          dcpassword: data.dcpassword,
          sealdata: sealData.location,
          sealfilename: sealData.key,
          userId: user._id,
          email
        });
        await newProxy.save();
        res.status(200).json(newProxy);
      } else {
        const newProxy = await NotaryDataModel.findOne({ userId: user._id });
        console.log('user:', newProxy);

        newProxy.commissionExpiresOn = data.commissionExpiresOn;
        newProxy.dcpassword = data.dcpassword;
        newProxy.sealdata = sealData.Location;
        newProxy.sealfilename = sealData.key;
        newProxy.userId = user._id;
        newProxy.email = email;
        await newProxy.save();
        res.status(200).json(newProxy);
      }
    } else {
      res.status(500).json({ message: 'Unable to generate notary seal.' })
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.connectStripe = async (req, res) => {
  try {
    const user = req.user;
    req = matchedData(req);
    const notarydm = await NotaryDataModel.findOne({ userId: user._id })
    if (!notarydm) {
      return res.status(400).json({
        error: true,
        errorMessage: 'Notary Data not found'
      })
    }
    let stripeAccountName = '';
    let stripeToUse;
    if (user.testingacc) {
      stripeToUse = stripeTest
    } else {
      stripeToUse = stripe
    }
    if (notarydm.stripeAccountName) {
      stripeAccountName = notarydm.stripeAccountName
    } else {
      const stripeResponse = await stripeToUse.accounts.create({
        type: 'express',
        email: user.email,
        capabilities: {
          card_payments: {requested: true},
          transfers: {requested: true}
        },
        business_profile: {
          // url: 'http://localhost:8080',
          url: 'https://app.bluenotary.us',
          mcc: 5045
        }
      });
      if (stripeResponse && stripeResponse.id) {
        stripeAccountName = stripeResponse.id
      }
      console.log('stripeResponse')
      console.log(stripeResponse)
      console.log('stripeAccountName')
      console.log(stripeAccountName)
      notarydm.stripeAccountName = stripeAccountName
      await notarydm.save()
    }

    let stripeAccountLink = '';
    // if (notarydm.stripeAccountLink) {
    //   stripeAccountLink = notarydm.stripeAccountLink
    // } else {
    let refreshUrl = 'https://app.bluenotary.us/notary/account-settings?stripeConfirmation=failure'
    let returnUrl = 'https://app.bluenotary.us/notary/account-settings?stripeConfirmation=success'
    if (process.env.NODE_ENV === 'development') {
      refreshUrl = 'http://localhost:8080/notary/account-settings?stripeConfirmation=failure'
      returnUrl = 'http://localhost:8080/notary/account-settings?stripeConfirmation=success'
    }
    const stripeResponse2 = await stripeToUse.accountLinks.create({
      account: stripeAccountName,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding'
    });
    console.log('stripeResponse2', stripeResponse2)
    stripeAccountLink = stripeResponse2.url
    notarydm.stripeAccountLink = stripeAccountLink
    notarydm.stripeAccountLinkValidTill = stripeResponse2.expires_at
    await notarydm.save()
    // }
    console.log(stripeAccountLink)
    res.status(200).json({
      success: true,
      stripeAccountLink
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.getAuditTrail = async (req, res) => {
  try {
    // const user = req.user;
    const sessionid = req.params && req.params.id;
    req = matchedData(req);
    // const sessionItem = await NewSessionModel.findOne({ _id: req.sessionId });
    console.log({sessionid})
    const auditTrail = await SessionUserLogs.find({sessionid: new mongoose.Types.ObjectId(sessionid)}).sort({_id: 1})
    const allAuditTrailUsers = await User.find({
      _id: {$in: _.uniq(_.compact(_.map(auditTrail, 'userId')))}
    })
    const auditTrailUsersKeyed = _.keyBy(allAuditTrailUsers, '_id')
    const finalAuditTrail = _.map(auditTrail, (tempAuditTrailItem) => {
      tempAuditTrailItem.userDoc = auditTrailUsersKeyed[tempAuditTrailItem.userId] || {}
      return tempAuditTrailItem
    })
    console.log('finalAuditTrail.length', finalAuditTrail.length)
    res.status(200).json({
      auditTrail: finalAuditTrail
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.archieveSessionItem = async (req, res) => {
  try {
    const user = req.user;
    req = matchedData(req);
    const sessionItem = await NewSessionModel.findOne({ _id: req.sessionId });
    sessionItem.archieved = true;
    if (!sessionItem.archievedBy) {
      sessionItem.archievedBy = []
    }
    sessionItem.archievedBy = _.union(sessionItem.archievedBy, [user._id])
    sessionItem.archievedAt = new Date();
    await sessionItem.save()
    res.status(200).json({
      success: true
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.unarchieveSessionItem = async (req, res) => {
  try {
    const user = req.user;
    req = matchedData(req);
    const sessionItem = await NewSessionModel.findOne({ _id: req.sessionId });
    sessionItem.archieved = null;
    sessionItem.archievedBy = _.filter(sessionItem.archievedBy, (tempUserDoc) => {
      return String(tempUserDoc) !== String(user._id)
    })
    console.log('sessionItem.archievedBy', sessionItem.archievedBy)
    sessionItem.archievedAt = null;
    await sessionItem.save()
    res.status(200).json({
      success: true
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.deleteSessionItem = async (req, res) => {
  try {
    req = matchedData(req);
    const item = await NewSessionModel.findOne({ sessionid: req.sessionId });
    const document = await DocumentModel.findOne({ sessionid: item._id, _id: req.documentId });
    console.log(item)
    if (document) {
      const params = {
        Bucket: process.env.AWSBucket,
        Key: document.key
      }

      try {
        await s3.headObject(params).promise()
        console.log('File Found in S3')
        try {
          await s3.deleteObject(params).promise()
          console.log('file deleted Successfully')
        } catch (err) {
          console.log('ERROR in file Deleting : ' + JSON.stringify(err))
        }
      } catch (err) {
        console.log('File not Found ERROR : ' + err)
      }
      await document.remove();
    }
    const deleted = await NewSessionModel.deleteOne({ sessionid: req.sessionId })

    console.log(deleted);
    const sessions = await NewSessionModel.find({ sessionid: item.sessionid })
    res.status(200).json(sessions);
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.deleteSessionDocument = async (req, res) => {
  try {
    req = matchedData(req);
    const document = await DocumentModel.findOne({ sessionid: req.sessionId, _id: req.documentId });
    if (document) {
      const params = {
        Bucket: process.env.AWSBucket,
        Key: document.key
      }

      try {
        await s3.headObject(params).promise()
        console.log('File Found in S3')
        try {
          await s3.deleteObject(params).promise()
          console.log('file deleted Successfully')
        } catch (err) {
          console.log('ERROR in file Deleting : ' + JSON.stringify(err))
        }
      } catch (err) {
        console.log('File not Found ERROR : ' + err)
      }
      await document.remove();
    }

    const session = await NewSessionModel.findOne({ _id: req.sessionId });
    const otherDocument = await DocumentModel.findOne({ sessionid: req.sessionId });
    if (!otherDocument) {
      session.originalDocumentId = null
    }
    if (session.originalDocumentIds) {
      session.originalDocumentIds = _.filter(session.originalDocumentIds, (tempDocumentId) => {
        return tempDocumentId !== req.documentId
      })
    }
    await session.save();
    res.status(200).json({session, document: [] });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.saveSessionData = async (req, res) => {
  try {

    // const user = req.user

    // const data = {
    //   sessionOpenCallForTaking: true
    // }
    const data = req.body && req.body.data || false;
    if (!data) {
      return res.status(400).json({error: 'Data Not Found' });
    }
    // req = matchedData(req);
    const session = await NewSessionModel.findOne({ _id: req.params.id });
    console.log(session)
    console.log(data, data.sessionOpenCallForTaking)
    if (data.notorizationTiming) {
      session.notorizationTiming = data.notorizationTiming;
      if (data.meetingdate) {
        session.meetingdate = data.meetingdate
        if (data.meetingTimeZone && session.notorizationTiming === 'notarize_later') {
          session.meetingTimeZone = data.meetingTimeZone
          let currentTimeZoneOffset = parseFloat(String((new Date()).getTimezoneOffset() / 60))
          if (data.currentTimeZone) {
            currentTimeZoneOffset = parseFloat(String(data.currentTimeZone))
          }
          const currentMeetingTimeZone = parseFloat(data.meetingTimeZone)
          const finalOffset = (currentMeetingTimeZone - currentTimeZoneOffset) * 60
          session.meetingdatetimeobj = moment(data.meetingdate, 'YYYY-MM-DD hh:mm A').utcOffset(finalOffset, true)
        } else {
          session.meetingdatetimeobj = moment(data.meetingdate, 'YYYY-MM-DD hh:mm A')
        }
      }
    }
    if (data.sessionOpenCallForTaking) {
      if (!session.notaryUserId) {
        const identityModelData = await IdentityModel.findOne({
          sessionid: req.params.id
        })
        session.sessionOpenCallForTaking = true
        session.sessionOpenCallForTakingAt = new Date();
        const shortSessionID = (req.params.id).toString().substr((req.params.id).toString().length - 5).toUpperCase();
        if (!req.user.testingacc) {
          await emailer.sendEmailToAllNotaries(shortSessionID, session, identityModelData);
        }
      }
    }
    if (data.paymentInfoCaptured) {
      if (session.multiSignerList) {
        _.map(session.multiSignerList, async (signerDoc) => {
          console.log(signerDoc)
          const email = signerDoc.email;
          let userDoc = await User.findOne({
            email,
            role: 'customer'
          })
          if (!userDoc) {
            userDoc = new User({
              name: 'Additional Signer',
              first_name: 'Additional',
              last_name: 'Signer',
              email,
              password: utils.generateRandomPassword(6),
              verification: uuid.v4(),
              role: 'customer',
              state: '',
              verified: true,
              testingacc: req.user.testingacc || false
            });
            await userDoc.save();
          }
          console.log('userDoc', userDoc)
          emailer.sendEmailToAdditionalSignerWhenInvitedToSession(userDoc, userDoc.password,
            getTimeOfSessionFormatted(session), req.params.id);
        })
      }
    }
    if (data.sessionOpenCallForTaking) {
      session.maxWitnessJoined = data.maxWitnessJoined
    }
    if (data.multiSignerList) {
      session.multiSignerList = data.multiSignerList
    }
    if (data.notaryUserId) {
      session.notaryUserId = data.notaryUserId
    }
    if (data.typeOfKBA) {
      session.typeOfKBA = data.typeOfKBA
    }
    await session.save()
    res.status(200).json({ success: true });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.pickUpSession = async (req, res) => {
  try {

    // const user = req.user

    const data = req.body && req.body.data || false;
    if (!data) {
      return res.status(400).json({errors: {msg: 'Data Not Found' }});
    }
    // req = matchedData(req);
    const session = await NewSessionModel.findOne({ _id: req.params.id });
    console.log('sessionold', session)
    if (!session.sessionOpenCallForTaking) {
      return res.status(400).json({errors: {msg: 'Session Already picked by Other Notary'}})
    }
    session.sessionOpenCallForTaking = false;
    // session.sessionOpenCallForTakingAt = null;
    session.sessionPickedCallForTakingAt = new Date();
    session.notaryUserId = req.user.id;
    session.status = 'ready to sign';
    console.log('sessionnew', session)
    const userDoc = await User.findOne({
      _id: session.userId
    })
    const shortSessionID = (session._id).toString().substr((session._id).toString().length - 5).toUpperCase();
    emailer.sendEmailToCustomerRegardingSessionPicked(userDoc, session.meetingdatetimeobj, shortSessionID);
    await session.save()
    res.status(200).json({ success: true });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.savePersonalData = async (req, res) => {
  try {

    const user = req.user

    req = matchedData(req);
    console.log('uploadFile:', req)
    const data = req.data

    if (user.updateUserNameOnFirstSession) {
      const userDoc = await User.findOne({
        _id: user._id
      })
      if (userDoc) {
        userDoc.first_name = data.firstName
        userDoc.last_name = data.lastName
        userDoc.name = data.firstName + ' ' + data.lastName
        userDoc.updateUserNameOnFirstSession = false
        await userDoc.save()
      }
    }

    const isExisting = await IdentityModel.exists({ sessionid: req.sessionId, userId: user._id })
    if (!isExisting) {
      let additionalSigner = false;
      if (req.additionalSigner) {
        additionalSigner = true
      }
      const newProxy = new IdentityModel({
        sessionid: req.sessionId,
        firstName: data.firstName,
        middelName: data.middelName,
        lastName: data.lastName,
        userSsn: data.userSsn,
        userZipCode: data.userZipCode,
        userState: data.userState,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        userId: user._id,
        email: user.email,
        additionalSigner
      })
      await newProxy.save()
      res.status(200).json({ message: 'Your information saved successfully for this session.' });
    } else {
      const newProxy = await IdentityModel.findOne({ sessionid: req.sessionId, userId: user._id })
      newProxy.firstName = data.firstName
      newProxy.middelName = data.middelName
      newProxy.lastName = data.lastName
      newProxy.userSsn = data.userSsn
      newProxy.userZipCode = data.userZipCode
      newProxy.userState = data.userState
      newProxy.addressLine1 = data.addressLine1
      newProxy.addressLine2 = data.addressLine2
      newProxy.birthdate = data.birthdate
      newProxy.userId = user._id
      newProxy.email = user.email
      await newProxy.save();
      res.status(200).json({ message: 'Your information saved successfully for this session.' });
    }

    // update session stage
    const session = await NewSessionModel.findOne({_id: req.sessionId});
    if (session.currentStage === 'identity_check_stage') {
      session.currentStage = 'payment_info_stage';
      session.stagesHistory.push({
        stageName: 'Payment Info stage',
        stageDate: new Date()
      });
      session.save();
    }

    const sessionUserLogsData2 = new SessionUserLogs({
      sessionid: new mongoose.Types.ObjectId(session._id),
      userId: new mongoose.Types.ObjectId(user._id),
      actionType: 'personal_details_filled'
    });
    sessionUserLogsData2.save();

    // update document stage
    const document = await DocumentModel.findOne({sessionid: session._id});
    if (document && document.uploadedStage === 'identity_check_stage') {
    document.uploadedStage = 'payment_info_stage';
    document.save();
  }
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.loadPersonalData = async (req, res) => {
  try {
    const user = req.user
    console.log(req.body)
    console.log(req.params)
    const getEvsResult = req.body.getEvsResult || false;
    req = matchedData(req);
    let sessions = await IdentityModel.findOne({ sessionid: req.sessionId, userId: user._id });
    sessions = JSON.parse(JSON.stringify(sessions || {}))
    // update session stage
    console.log(sessions)
    const session = await NewSessionModel.findOne({_id: req.sessionId});
    if (session.currentStage === 'initial_stage') {
      session.currentStage = 'identity_check_stage';
      session.stagesHistory.push({
        stageName: 'Identity check stage',
        stageDate: new Date()
      });
      session.save();
    }
    sessions.sessionDoc = session

    // update document stage
    const document = await DocumentModel.findOne({sessionid: session._id});
    if (document && document.uploadedStage === 'initial_stage') {
      document.uploadedStage = 'identity_check_stage';
      document.save();
    }
    // if (sessions.backPhotoIdKey) {
    //   const url = s3.getSignedUrl('getObject', {
    //       Bucket: process.env.AWSBucket,
    //       Key: sessions.backPhotoIdKey,
    //       Expires: 60 * 60 * 24 * 6
    //   });
    //   sessions.backPhotoIdUrl = url
    // }
    console.log('getEvsResult', getEvsResult)
    if (getEvsResult) {
      let cardAPIResponseDoc = {
        platformresponse: {
          response: {}
        }
      }
      if (sessions.cardAPIResponseDoc) {
        cardAPIResponseDoc = JSON.parse(JSON.stringify(sessions.cardAPIResponseDoc))
      }
      const responseDoc = cardAPIResponseDoc && cardAPIResponseDoc.platformresponse &&
      cardAPIResponseDoc.platformresponse.response && cardAPIResponseDoc.platformresponse.response[0] || false
      if (responseDoc) {
        // const verificationConfidence = cardAPIResponseDoc?.platformresponse?.response?.[0]?.questions?.[0]?.question;
        const verificationConfidence = cardAPIResponseDoc?.platformresponse?.response?.[0]?.
        cardresult?.[0]?.faceverificationconfidence?.[0]
        const finalResponse = {
          allDetail: null,
          workflowOutcome: responseDoc && responseDoc.workflowoutcome && responseDoc.workflowoutcome[0]
          && responseDoc.workflowoutcome[0]._ ? responseDoc.workflowoutcome[0]._ : '',
          documentValidationResult: responseDoc && responseDoc.cardresult && responseDoc.cardresult[0]
            && responseDoc.cardresult[0].validationresult && responseDoc.cardresult[0].validationresult[0] &&
            responseDoc.cardresult[0].validationresult[0]._ || '',
          documentExpirationResult: responseDoc && responseDoc.cardresult && responseDoc.cardresult[0]
          && responseDoc.cardresult[0].validationresult && responseDoc.cardresult[0].validationresult[0] &&
          responseDoc.cardresult[0].validationresult[0]._ || '',
          frontPhotoUrl: sessions.frontPhotoIdUrl || false,
          backPhotoUrl: sessions.backPhotoIdUrl || false,
          verificationConfidence
        }
        sessions.evsRes = finalResponse
        if (finalResponse.workflowOutcome === 'Fail') {
          const sessionUserLogsData = new SessionUserLogs({
            sessionid: new mongoose.Types.ObjectId(session._id),
            userId: new mongoose.Types.ObjectId(user._id),
            actionType: 'photo_id_failed'
          });
          sessionUserLogsData.save();
        } else {
          const sessionUserLogsData2 = new SessionUserLogs({
            sessionid: new mongoose.Types.ObjectId(session._id),
            userId: new mongoose.Types.ObjectId(user._id),
            actionType: 'photo_id_passed'
          });
          sessionUserLogsData2.save();
          if (session.typeOfKBA === 'foreigners_without_residential' && sessions.typeOfPhotoId === 'passportbook') {
            const sessionUserLogsData3 = new SessionUserLogs({
              sessionid: new mongoose.Types.ObjectId(session._id),
              userId: new mongoose.Types.ObjectId(user._id),
              actionType: 'biometrics_passed'
            });
            sessionUserLogsData3.save();
          }
        }
      }
    }
    res.status(200).json(sessions);
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.sessiondata = async (req, res) => {
  try {
    const user = req.user
    console.log('user:', user)
    const businessSessions = req.body.businessSessions || false
    const showArchievedSessions = req.body.showArchievedSessions || false
    console.log('businessSessions', businessSessions)
    req = matchedData(req);
    let mySessionsQuery
    if (businessSessions) {
      mySessionsQuery = {
        invitedByCustomer: user._id
      }
    } else {
      mySessionsQuery = {
        $or: [
          {
            userId: user._id
          },
          {
            multiSignerList: {
              $elemMatch: {
                email: user.email
              }
            }
          }
        ]
      }
    }
    console.log(mySessionsQuery)
    if (showArchievedSessions) {
      mySessionsQuery.archievedBy = user._id
    } else {
      mySessionsQuery.archievedBy = {$ne: user._id}
    }
    const sessions = await NewSessionModel.find(mySessionsQuery).sort({createdAt: -1});
    const sessionData = [];
    const allAdditionalSignerEmails = []
    let sessionIdentityDocsKeyed = {}
    const allSessionIds = _.map(sessions, '_id')
    for (const item of sessions) {
      if (item.multiSignerList) {
        _.map(item.multiSignerList, (multiSignerDoc) => {
          if (multiSignerDoc.email) {
            allAdditionalSignerEmails.push(multiSignerDoc.email)
          }
        })
      }
    }
    let additionalSignerEmailUserDocMap = {}
    if (allAdditionalSignerEmails.length) {
      const allAdditionalSignerUserDocs = await User.find({
        email: {$in: allAdditionalSignerEmails}
      })
      additionalSignerEmailUserDocMap = _.keyBy(allAdditionalSignerUserDocs, 'email')
    }
    const sessionIdentityDocs = await IdentityModel.find({
      sessionid: {$in: allSessionIds}
    })
    sessionIdentityDocsKeyed = _.groupBy(sessionIdentityDocs, 'sessionid')
    for (const item of sessions) {
      let finalDocumentId = item.finalDocumentId;
      let videoDataId = item.videoFileDocumentId;
      if (item.paid === false) {
        finalDocumentId = ''
        videoDataId = ''
      }
      let finalDocument;
      // if (item.status === 'complete' && item.finalDocumentId) {
      if (finalDocumentId) {
        finalDocument = await DocumentModel.find({ sessionid: item._id,
          documentCategory: 'final_document_with_dc' });
        // finalDocument = await DocumentModel.findOne({ _id: finalDocumentId });
      } else {
        finalDocument = false;
      }
      let videoData;
      if (videoDataId) {
        videoData = await DocumentModel.findOne({ _id: videoDataId });
      } else {
        videoData = false
      }
      const documents = await DocumentModel.find({ sessionid: item._id, documentCategory: 'initial_document' });
      const notary = await User.findOne({_id: item.notaryUserId});
      let signerDocForBusinessSession
      if (businessSessions) {
        signerDocForBusinessSession = await User.findOne({_id: item.userId});
      }
      const allNotaryIdentities = sessionIdentityDocsKeyed[item._id] || []
      const notaries = allNotaryIdentities && allNotaryIdentities[0] || {}
      const additionalSignerIdentyDocs = []
      let currentUserAdditionalSigner = false
      let currentUserAdditionalSignerStage = ''
      _.map(item.multiSignerList, (multiSignerDoc) => {
        if (multiSignerDoc.email === user.email) {
          currentUserAdditionalSigner = true
        }
        const userDoc = additionalSignerEmailUserDocMap[multiSignerDoc.email]
        let identityDocFound = false
        if (userDoc) {
          _.map(allNotaryIdentities, (tempIdentityDoc) => {
            if (String(tempIdentityDoc.userId) === String(userDoc._id)) {
              additionalSignerIdentyDocs.push(tempIdentityDoc)
              identityDocFound = true
              if (multiSignerDoc.email === user.email) {
                currentUserAdditionalSignerStage = tempIdentityDoc.additionalSignerNextStage
              }
            }
          })
        }
        if (!identityDocFound) {
          additionalSignerIdentyDocs.push(multiSignerDoc)
        }
      })
      const sessionJoinedUserLog = await SessionUserLogs.findOne({
        sessionid: item._id,
        actionType : 'join_session'
      })
      let sessionStartedTime = false;
      if (sessionJoinedUserLog) {
        sessionStartedTime = sessionJoinedUserLog.createdAt
      }
      sessionData.push({
        current_session_id: item._id,
        sessionId: item.sessionid,
        currentStage: item.currentStage,
        status: item.status,
        files: documents,
        finalDocument,
        notaries,
        paymentData: false,
        videoData,
        meetingdate: (item.meetingdate) ? item.meetingdate : 'N/A',
        meetingTimeZone: item.meetingTimeZone,
        // shotId: (item.sessionid).toString().substr((item.sessionid).toString().length - 5).toUpperCase(),
        session: item,
        notary,
        additionalSignerIdentyDocs,
        currentUserAdditionalSigner,
        currentUserAdditionalSignerStage,
        sessionStartedTime,
        signerDocForBusinessSession
      })
      // payment data
      // video data
    }
    const apiOutput = {
      sessionData,
      freeSessionsLeft: null,
      totalSessionsDone: null
    }
    if (businessSessions) {
      let totalSessionsDone = 0
      const orQuery = []
      orQuery.push({
        invitedByCustomer: user._id
      })
      orQuery.push({
        userId: user._id
      })
      const allUserNotaryLinked = await UserNotaryRelation.find({
        customerid: user._id,
        relationType: 'invited'
      })
      if (allUserNotaryLinked.length) {
        orQuery.push({
          notaryUserId: user._id
        })
      }
      totalSessionsDone = await NewSessionModel.count({
        $or: orQuery,
        status: 'complete',
        createdAt: {$gte: moment().startOf('month')}
      })
      let freeSessionsLeft = 7
      if (totalSessionsDone) {
        if (totalSessionsDone > 7) {
          freeSessionsLeft = 0
        } else {
          freeSessionsLeft = 7 - totalSessionsDone
        }
      }
      apiOutput.freeSessionsLeft = freeSessionsLeft
      apiOutput.totalSessionsDone = totalSessionsDone
    }
    res.status(200).json(apiOutput);
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.sessiondatawithPagination = async (req, res) => {
  try {
    const user = req.user
    console.log('user:', user)
    const businessSessions = req.body.businessSessions || false
    const showArchievedSessions = req.body.showArchievedSessions || false
    console.log('businessSessions', businessSessions)
    // req = matchedData(req);
    let mySessionsQuery
    if (businessSessions) {
      mySessionsQuery = {
        invitedByCustomer: user._id
      }
    } else {
      mySessionsQuery = {
        $or: [
          {
            userId: user._id
          },
          {
            multiSignerList: {
              $elemMatch: {
                email: user.email
              }
            }
          }
        ]
      }
    }
    console.log(mySessionsQuery)
    if (showArchievedSessions) {
      mySessionsQuery.archievedBy = user._id
    } else {
      mySessionsQuery.archievedBy = {$ne: user._id}
    }
    // tslint:disable-next-line:max-line-length
    const sessions = await NewSessionModel.paginate(mySessionsQuery, { page: req.params.id, limit: 10, sort: { createdAt: -1 } });
    const sessionData = [];
    const allAdditionalSignerEmails = []
    let sessionIdentityDocsKeyed = {}
    const allSessionIds = _.map(sessions.docs, '_id')
    for (const item of sessions.docs) {
      if (item.multiSignerList) {
        _.map(item.multiSignerList, (multiSignerDoc) => {
          if (multiSignerDoc.email) {
            allAdditionalSignerEmails.push(multiSignerDoc.email)
          }
        })
      }
    }
    let additionalSignerEmailUserDocMap = {}
    if (allAdditionalSignerEmails.length) {
      const allAdditionalSignerUserDocs = await User.find({
        email: {$in: allAdditionalSignerEmails}
      })
      additionalSignerEmailUserDocMap = _.keyBy(allAdditionalSignerUserDocs, 'email')
    }
    const sessionIdentityDocs = await IdentityModel.find({
      sessionid: {$in: allSessionIds}
    })
    sessionIdentityDocsKeyed = _.groupBy(sessionIdentityDocs, 'sessionid')
    for (const item of sessions.docs) {
      let finalDocumentId = item.finalDocumentId;
      let videoDataId = item.videoFileDocumentId;
      if (item.paid === false) {
        finalDocumentId = ''
        videoDataId = ''
      }
      let finalDocument;
      // if (item.status === 'complete' && item.finalDocumentId) {
      if (finalDocumentId) {
        finalDocument = await DocumentModel.find({ sessionid: item._id,
          documentCategory: 'final_document_with_dc' });
        // finalDocument = await DocumentModel.findOne({ _id: finalDocumentId });
      } else {
        finalDocument = false;
      }
      let videoData;
      if (videoDataId) {
        videoData = await DocumentModel.findOne({ _id: videoDataId });
      } else {
        videoData = false
      }
      const documents = await DocumentModel.find({ sessionid: item._id, documentCategory: 'initial_document' });
      const notary = await User.findOne({_id: item.notaryUserId});
      let signerDocForBusinessSession
      if (businessSessions) {
        signerDocForBusinessSession = await User.findOne({_id: item.userId});
      }
      const allNotaryIdentities = sessionIdentityDocsKeyed[item._id] || []
      const notaries = allNotaryIdentities && allNotaryIdentities[0] || {}
      const additionalSignerIdentyDocs = []
      let currentUserAdditionalSigner = false
      let currentUserAdditionalSignerStage = ''
      _.map(item.multiSignerList, (multiSignerDoc) => {
        if (multiSignerDoc.email === user.email) {
          currentUserAdditionalSigner = true
        }
        const userDoc = additionalSignerEmailUserDocMap[multiSignerDoc.email]
        let identityDocFound = false
        if (userDoc) {
          _.map(allNotaryIdentities, (tempIdentityDoc) => {
            if (String(tempIdentityDoc.userId) === String(userDoc._id)) {
              additionalSignerIdentyDocs.push(tempIdentityDoc)
              identityDocFound = true
              if (multiSignerDoc.email === user.email) {
                currentUserAdditionalSignerStage = tempIdentityDoc.additionalSignerNextStage
              }
            }
          })
        }
        if (!identityDocFound) {
          additionalSignerIdentyDocs.push(multiSignerDoc)
        }
      })
      const sessionJoinedUserLog = await SessionUserLogs.findOne({
        sessionid: item._id,
        actionType : 'join_session'
      })
      let sessionStartedTime = false;
      if (sessionJoinedUserLog) {
        sessionStartedTime = sessionJoinedUserLog.createdAt
      }
      sessionData.push({
        current_session_id: item._id,
        sessionId: item.sessionid,
        currentStage: item.currentStage,
        status: item.status,
        files: documents,
        finalDocument,
        notaries,
        paymentData: false,
        videoData,
        meetingdate: (item.meetingdate) ? item.meetingdate : 'N/A',
        meetingTimeZone: item.meetingTimeZone,
        // shotId: (item.sessionid).toString().substr((item.sessionid).toString().length - 5).toUpperCase(),
        session: item,
        notary,
        additionalSignerIdentyDocs,
        currentUserAdditionalSigner,
        currentUserAdditionalSignerStage,
        sessionStartedTime,
        signerDocForBusinessSession
      })
      // payment data
      // video data
    }
    const  paginate = {totalDocs: sessions.totalDocs,
      offset: sessions.offset,
      limit: sessions.limit,
      totalPages: sessions.totalPages,
      page: sessions.page,
      pagingCounter: sessions.pagingCounter,
      hasPrevPage: sessions.hasPrevPage,
      hasNextPage: sessions.hasNextPage,
      prevPage: sessions.prevPage,
      nextPage: sessions.nextPage
    };
    const apiOutput = {
      sessionData,
      paginate,
      freeSessionsLeft: null,
      totalSessionsDone: null
    }
    if (businessSessions) {
      let totalSessionsDone = 0
      const orQuery = []
      orQuery.push({
        invitedByCustomer: user._id
      })
      orQuery.push({
        userId: user._id
      })
      const allUserNotaryLinked = await UserNotaryRelation.find({
        customerid: user._id,
        relationType: 'invited'
      })
      if (allUserNotaryLinked.length) {
        orQuery.push({
          notaryUserId: user._id
        })
      }
      totalSessionsDone = await NewSessionModel.count({
        $or: orQuery,
        status: 'complete',
        createdAt: {$gte: moment().startOf('month')}
      })
      let freeSessionsLeft = 7
      if (totalSessionsDone) {
        if (totalSessionsDone > 7) {
          freeSessionsLeft = 0
        } else {
          freeSessionsLeft = 7 - totalSessionsDone
        }
      }
      apiOutput.freeSessionsLeft = freeSessionsLeft
      apiOutput.totalSessionsDone = totalSessionsDone
    }
    res.status(200).json(apiOutput);
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.getOneSessionFullData = async (req, res) => {
  const sessionid = req.params && req.params.id
  if (!sessionid) {
    res.status(400).json({
      error: 'Session id not found'
    })
  }
  const newSessionModelData = await NewSessionModel.findOne({
    _id: sessionid
  })
  if (!newSessionModelData) {
    return res.status(404).json({
      error: 'Session doc not found'
    })
  }
  const responseData = {
    newSessionModelData,
    notaryUser: null,
    originalDocument: null,
    allDocumentDocs: null,
    pdfDroppedElementDatas: null,
    customerUser: null,
    notaryDatasDoc: null,
    statePricingDoc: null,
    multiSignerUserDocs: null,
    businessUserSubsidizedSession: '',
    invitedByCustomerUserDoc: null
  }
  console.log('newSessionModelData.notaryUserId', newSessionModelData.notaryUserId)
  if (!newSessionModelData.notaryUserId) {
    if (req.user.role === 'notary') {
      newSessionModelData.notaryUserId = req.user.id;
      await newSessionModelData.save()
    }
  }

  let sessionWitnessQuery;
  if (req.user.role === 'witness' && req.user.witnessid) {
    sessionWitnessQuery = {
      $or: [
        {
          sessionid,
          userid: req.user._id
        },
        {
          sessionid,
          witnessid: req.user.witnessid
        }
      ]
    }
  } else {
    sessionWitnessQuery = {
      $or: [
        {
          sessionid,
          userid: req.user._id
        }
      ]
    }
  }
  const userAlreadyWitnessInCurrentSession = await SessionWitness.findOne(sessionWitnessQuery)
  console.log(req.user)
  console.log('newSessionModelData', newSessionModelData)
  let userInAdditionalWitnessList = false;
  _.map(newSessionModelData.multiSignerList || [], (signerDoc) => {
    if (signerDoc.email === req.user.email) {
      userInAdditionalWitnessList = true;
    }
  })
  if (!(String(newSessionModelData.userId) === String(req.user.id) ||
    String(newSessionModelData.notaryUserId) === String(req.user.id) ||
    userAlreadyWitnessInCurrentSession || userInAdditionalWitnessList)) {
    return res.status(400).json({
      errors: {
        msg: 'You dont have permission to view this session'
      }
    })
  }
  if (userAlreadyWitnessInCurrentSession && String(newSessionModelData.notaryUserId) !== String(req.user.id) &&
  !req.query.witness) {
    return res.status(400).json({
      errors: {
        msg: 'You dont have permission to view this session as non witness'
      }
    })
  }
  if (newSessionModelData.notaryUserId) {
    const notaryUser = await User.findOne({
      _id: newSessionModelData.notaryUserId
    })
    if (notaryUser) {
      responseData.notaryUser = notaryUser
    }
    const notaryDatasDoc = await NotaryDataModel.findOne({
      userId: newSessionModelData.notaryUserId
    })
    if (notaryDatasDoc) {
      responseData.notaryDatasDoc = notaryDatasDoc
    }
  }
  if (newSessionModelData.invitedByCustomer) {
    const invitedByCustomerUserDoc = await User.findOne({
      _id: newSessionModelData.invitedByCustomer
    })
    if (invitedByCustomerUserDoc) {
      responseData.invitedByCustomerUserDoc = invitedByCustomerUserDoc
    }
  }
  if (newSessionModelData.userId) {
    let customerUser = await User.findOne({
      _id: newSessionModelData.userId
    })
    if (customerUser) {
      const identityDataResponse = await IdentityModel.findOne({
        userId: customerUser._id,
        sessionid: String(sessionid)
      })
      customerUser = JSON.parse(JSON.stringify(customerUser))
      customerUser.identityData = identityDataResponse
      responseData.customerUser = customerUser
    }
  }
  const originalDocumentId = newSessionModelData.originalDocumentId
  const allDocumentIds = newSessionModelData.originalDocumentIds || []
  if (!_.includes(allDocumentIds, originalDocumentId)) {
    allDocumentIds.push(originalDocumentId)
  }
  const originalDocuments = await DocumentModel.find({
    _id: {$in: allDocumentIds}
  })
  let originalDocument
  _.map(originalDocuments, (tempOriginalDocument) => {
    if (tempOriginalDocument._id === originalDocumentId) {
      originalDocument = tempOriginalDocument
    }
  })
  if (!originalDocument) {
    originalDocument = (originalDocuments && originalDocuments[0]) || {}
  }
  responseData.originalDocument = originalDocument
  responseData.allDocumentDocs = originalDocuments

  const pdfDroppedElementDataDoc = await PDFDroppedElementsModel.findOne({ sessionid });
  if (pdfDroppedElementDataDoc) {
    responseData.pdfDroppedElementDatas = pdfDroppedElementDataDoc
  } else {
    const draftsDoc = await SessionDraftsModel.findOne({ sessionid })
    if (draftsDoc) {
      responseData.pdfDroppedElementDatas = draftsDoc
    }
  }

  const notaryUserDoc = await User.findOne({
    _id: newSessionModelData.notaryUserId
  })
  let stateToUse = 'Others'
  if (notaryUserDoc && notaryUserDoc.state) {
    stateToUse = notaryUserDoc.state
  }
  console.log('stateToUse', stateToUse)
  let pricingDoc = PricingJson.pricing[stateToUse]
  if (!pricingDoc) {
    pricingDoc = PricingJson.pricing.Others
  }
  responseData.statePricingDoc = pricingDoc
  const multiSignerListEmail = _.map(newSessionModelData.multiSignerList || [], 'email')
  if (multiSignerListEmail.length) {
    const multiSignerUserDocs = await User.find({
      email: {$in: multiSignerListEmail}
    })
    const multiSignerIdentitiesModel = await IdentityModel.find({
      sessionid,
      userId: {$in: _.map(multiSignerUserDocs, '_id')}
    })
    const multiginerIdentitesKeyed = _.keyBy(multiSignerIdentitiesModel, 'userId')
    responseData.multiSignerUserDocs = _.map(multiSignerUserDocs, (tempUserDoc) => {
      let currentStage = 'KBA and Photo ID Check Not Completed'
      tempUserDoc = JSON.parse(JSON.stringify(tempUserDoc))
      if (tempUserDoc._id && multiginerIdentitesKeyed[tempUserDoc._id]) {
        tempUserDoc.identityData = multiginerIdentitesKeyed[tempUserDoc._id]
        if (tempUserDoc.identityData.additionalSignerNextStage === 'meet_notary') {
          currentStage = 'KBA and Photo ID Check Successful'
        } else if (tempUserDoc.identityData.additionalSignerNextStage === 'photoid_check_stage') {
          currentStage = 'KBA Successful. Photo ID Check Not Completed'
        }
      }
      tempUserDoc.currentStage = currentStage
      return tempUserDoc
    })
  }
  responseData.businessUserSubsidizedSession = await getBusinessUserSubsidizedSession(newSessionModelData,
    responseData.customerUser, responseData.invitedByCustomerUserDoc)
  res.status(200).json(responseData);
};

exports.getConsumerPlusApiResponse = async (req, res) => {
  const user = req.user
  const sessionid = req.params && req.params.id;
  if (!sessionid) {
    res.status(400).json({
      error: 'Session id not found'
    })
  }
  const demo = req.query.demo ? true : false;
  console.log('demo: ',  demo, req.query.demo);
  const finalResponseData = {
    customerUser: null,
    identityDataResponse: null
  }
  const newSessionModelData = await NewSessionModel.findOne({
    _id: sessionid
  })
  if (newSessionModelData.meetingdatetimeobj) {
    console.log(moment(), newSessionModelData.meetingdatetimeobj, moment(newSessionModelData.meetingdatetimeobj),
    moment(newSessionModelData.meetingdatetimeobj).add(parseFloat(newSessionModelData.meetingTimeZone) * 60, 'minutes'),
    newSessionModelData.meetingTimeZone)
    const dateDifferenceInHours = moment().diff(moment(newSessionModelData.meetingdatetimeobj)
    .add(parseFloat(newSessionModelData.meetingTimeZone) * 60, 'minutes'), 'hours');
    console.log('dateDifferenceInHours', dateDifferenceInHours, newSessionModelData.meetingTimeZone)
    if (!(dateDifferenceInHours >= -15 && dateDifferenceInHours <= 15)) {
      return res.status(200).json({
        test: [],
        output: 'Identity Check Outside Time',
        details: {}
      })
    }
  }
  let identityDataResponse = {
    firstName: null,
    lastName: null,
    consumerPlusAPIResponseDoc: null,
    addressLine1: null,
    userZipCode: null,
    userSsn: null,
    birthdate: null
  };
  if (newSessionModelData.userId) {
    const customerUser = await User.findOne({
      _id: newSessionModelData.userId
    })
    if (customerUser) {
      finalResponseData.customerUser = customerUser
    }
    identityDataResponse = await IdentityModel.findOne({
      userId: user._id,
      sessionid: String(sessionid)
    })
    if (identityDataResponse) {
      finalResponseData.identityDataResponse = identityDataResponse;
    } // end check id data response
  }
  const builder = new XMLBuilder();
  if (!(identityDataResponse && identityDataResponse.firstName)) {
    return res.status(400).json({
      error: 'Identities Data Not Found'
    })
  }
  const sessionUserLogsData = new SessionUserLogs({
    sessionid: new mongoose.Types.ObjectId(sessionid),
    userId: new mongoose.Types.ObjectId(newSessionModelData.userId),
    actionType: 'kba_started'
  });
  sessionUserLogsData.save();
  newSessionModelData.kbaStartedAt = new Date()
  newSessionModelData.save()
  const jsObjectToSend = {
    PlatformRequest: {
      Credentials: {
        Username: 'E27368-65DCF76C-B477-4167-83F4-2E63D0690D4C',
        Password: 'nN0Q44tYmykA5ib'
      },
      CustomerReference: 'E27368-65DCF76C-B477-4167-83F4-2E63D0690D4C',
      Identity: {
        FirstName: identityDataResponse.firstName,
        LastName: identityDataResponse.lastName,
        DateOfBirth: moment(identityDataResponse.birthdate, 'YYYY/MM/DD').format('YYYY-MM-DD'),
        // Street: '13584 ST RD 62',
        // ZipCode: '47537',
        // Ssn: '222222222',
        // Ssn: demo ? '444444444' : identityDataResponse.userSsn,
        // Ssn: demo ? '333333333' : identityDataResponse.userSsn,
        Ssn: demo ? '222222222' : identityDataResponse.userSsn,
        Street: identityDataResponse.addressLine1, // TODO : Uncomment when testing is done
        ZipCode: identityDataResponse.userZipCode // TODO : Uncomment when testing is done
        // Ssn: identityDataResponse.userSsn, // TODO : Uncomment when testing is done
      }
    }
  }
  console.log('jsObjectToSend', jsObjectToSend);
  // If we have already fetched the consumer+ api, we will return that reponse from db only
  if (identityDataResponse.consumerPlusAPIResponseDoc) {
    const jObj = identityDataResponse.consumerPlusAPIResponseDoc;
    const tempResponse = jObj.PlatformResponse && jObj.PlatformResponse.Response || {};
    if (tempResponse && tempResponse.Questions && tempResponse.Questions.Question &&
        tempResponse.Questions.Question.length < 10) {
      const newQuestionsNeeded = 10 - tempResponse.Questions.Question.length;
      console.log('newQuestionsNeeded', newQuestionsNeeded)
      for (let i = 0; i < newQuestionsNeeded; i += 1) {
        tempResponse.Questions.Question.push(tempResponse.Questions.Question[i])
      }
    }
    const finalOutput = {
      test: tempResponse,
      output: tempResponse.WorkflowOutcome && tempResponse.WorkflowOutcome.text || 'Fail',
      details: tempResponse.StandardizedAddress || {}
    }
    res.status(200).json(finalOutput)
  } else {
    const newIdentityDataResponse = await IdentityModel.findOne({
      userId: user._id,
      sessionid: String(sessionid)
    });
    const xmlContent = builder.build(jsObjectToSend);
    const finalXMLRequest = '<?xml version="1.0" encoding="utf-8"?>' + xmlContent
    // console.log(xmlContent)
    const evsFillAPIUrl = 'https://identiflo.everification.net/WebServices/Integrated/Main/V220/ConsumerPlus'
    const headers = {'Content-Type': 'application/xml'}
    request.post({url: evsFillAPIUrl, body: finalXMLRequest, headers}, (error, response, body) => {
      console.log('error', error)
      const parser = new XMLParser({
        attributeNamePrefix : '@_',
        ignoreAttributes : false,
        ignoreNameSpace: false,
        textNodeName : 'text'
      });
      const jObj = parser.parse(body);
      const tempResponse = jObj.PlatformResponse && jObj.PlatformResponse.Response || {}
      console.log('tempResponse', tempResponse)
      if (newIdentityDataResponse) {
        newIdentityDataResponse.consumerPlusAPIResponseDoc = JSON.parse(JSON.stringify(jObj))
        newIdentityDataResponse.save();
      }
      if (!demo && tempResponse && tempResponse.Questions && tempResponse.Questions.Question) {
        tempResponse.Questions.Question = _.map(tempResponse.Questions.Question, (questionDoc) => {
          if (questionDoc.Answer) {
            questionDoc.Answer = _.map(questionDoc.Answer, (answerDoc) => {
              delete answerDoc['@_correct']
              return answerDoc
            })
          }
          return questionDoc
        })
      }
      if (tempResponse && tempResponse.Questions && tempResponse.Questions.Question &&
        tempResponse.Questions.Question.length < 10) {
        const newQuestionsNeeded = 10 - tempResponse.Questions.Question.length;
        console.log('newQuestionsNeeded', newQuestionsNeeded)
        for (let i = 0; i < newQuestionsNeeded; i += 1) {
          tempResponse.Questions.Question.push(tempResponse.Questions.Question[i])
        }
      }
      const finalOutput = {
        test: tempResponse,
        output: tempResponse.WorkflowOutcome && tempResponse.WorkflowOutcome.text || 'Fail',
        details: tempResponse.StandardizedAddress || {}
      }
      res.status(200).json(finalOutput)
    });
  }
};

exports.getCustomerDetailsDuringSessionFlow = async (req, res) => {
  const user = req.user
  const sessionid = req.params && req.params.id;
  if (!sessionid) {
    res.status(400).json({
      error: 'Session id not found'
    })
  }
  const demo = req.query.demo ? true : false;
  console.log('demo: ',  demo, req.query.demo);
  const finalResponseData = {
    customerUser: null,
    identityDataResponse: null
  }
  const newSessionModelData = await NewSessionModel.findOne({
    _id: sessionid
  })
  if (newSessionModelData.meetingdatetimeobj) {
    console.log(moment(), newSessionModelData.meetingdatetimeobj, moment(newSessionModelData.meetingdatetimeobj),
    moment(newSessionModelData.meetingdatetimeobj).add(parseFloat(newSessionModelData.meetingTimeZone) * 60, 'minutes'),
    newSessionModelData.meetingTimeZone)
    const dateDifferenceInHours = moment().diff(moment(newSessionModelData.meetingdatetimeobj)
    .add(parseFloat(newSessionModelData.meetingTimeZone) * 60, 'minutes'), 'hours');
    console.log('dateDifferenceInHours', dateDifferenceInHours, newSessionModelData.meetingTimeZone)
    if (!(dateDifferenceInHours >= -15 && dateDifferenceInHours <= 15)) {
      return res.status(200).json({
        test: [],
        output: 'Identity Check Outside Time',
        details: {}
      })
    }
  }
  let identityDataResponse = {
    firstName: null,
    lastName: null,
    fillAPIResponseDoc: null,
    addressLine1: null,
    userZipCode: null,
    userSsn: null,
    birthdate: null,
    cardAPIResponseDoc: null,
    consumerPlusAPIResponseDoc: null,
    typeOfPhotoId: null
  };
  if (newSessionModelData.userId) {
    const customerUser = await User.findOne({
      _id: newSessionModelData.userId
    })
    if (customerUser) {
      finalResponseData.customerUser = customerUser
    }
    identityDataResponse = await IdentityModel.findOne({
      userId: user._id,
      sessionid: String(sessionid)
    })
    if (identityDataResponse) {
      finalResponseData.identityDataResponse = identityDataResponse;
    } // end check id data response
  }
  if (!(identityDataResponse && identityDataResponse.firstName)) {
    return res.status(400).json({
      error: 'Identities Data Not Found'
    })
  }
  newSessionModelData.kbaStartedAt = new Date()
  newSessionModelData.save()
  const sessionUserLogsData = new SessionUserLogs({
    sessionid: new mongoose.Types.ObjectId(sessionid),
    userId: new mongoose.Types.ObjectId(newSessionModelData.userId),
    actionType: 'kba_started'
  });
  sessionUserLogsData.save();
  // const jsObjectToSend = {
  //   PlatformRequest: {
  //     Credentials: {
  //       Username: 'E27368-65DCF76C-B477-4167-83F4-2E63D0690D4C',
  //       Password: 'nN0Q44tYmykA5ib'
  //     },
  //     CustomerReference: 'E27368-65DCF76C-B477-4167-83F4-2E63D0690D4C',
  //     Identity: {
  //       FirstName: identityDataResponse.firstName,
  //       LastName: identityDataResponse.lastName,
  //       DateOfBirth: moment(identityDataResponse.birthdate, 'YYYY/MM/DD').format('YYYY-MM-DD'),
  //       // Street: '13584 ST RD 62',
  //       // ZipCode: '47537',
  //       // Ssn: '222222222',
  //       // Ssn: demo ? '444444444' : identityDataResponse.userSsn,
  //       // Ssn: demo ? '333333333' : identityDataResponse.userSsn,
  //       Ssn: demo ? '222222222' : identityDataResponse.userSsn,
  //       Street: identityDataResponse.addressLine1, // TODO : Uncomment when testing is done
  //       ZipCode: identityDataResponse.userZipCode // TODO : Uncomment when testing is done
  //       // Ssn: identityDataResponse.userSsn, // TODO : Uncomment when testing is done
  //     }
  //   }
  // }
  // console.log('jsObjectToSend', jsObjectToSend);
  // If we have already fetched the consumer+ api, we will return that reponse from db only
  let finalOutput
  const cardObj = identityDataResponse.cardAPIResponseDoc;
  console.log('cardObj', cardObj)
  let checkCardObject = true;
  if (identityDataResponse.typeOfPhotoId === 'passportbook') {
    checkCardObject = false;
  }
  console.log('checkCardObject', checkCardObject)
  if (cardObj && checkCardObject) {
    const questionDocs = cardObj?.platformresponse?.response?.[0]?.questions?.[0]?.question;
    const finalQuestionDocs = []
    _.map(questionDocs, (tempQuestionDoc) => {
      finalQuestionDocs.push({
        '@_text': tempQuestionDoc?.temp?.text,
        '@_type': tempQuestionDoc?.temp?.type,
        'Answer': _.map(tempQuestionDoc.answer, (tempAnswerDoc) => {
          return {
            'text': tempAnswerDoc._,
            '@_correct': tempAnswerDoc?.temp?.correct
          }
        })
      })
    })
    if (finalQuestionDocs.length < 10) {
      const newQuestionsNeeded = 10 - finalQuestionDocs.length;
      console.log('newQuestionsNeeded', newQuestionsNeeded)
      for (let i = 0; i < newQuestionsNeeded; i += 1) {
        const questionDoc = finalQuestionDocs[i];
        // if (demo && user.testingacc) {
        // // if (demo) {
        //   questionDoc.Answer = _.map(questionDoc.Answer, (answerDoc) => {
        //     delete answerDoc["@_correct"]
        //     return answerDoc
        //   })
        // }
        finalQuestionDocs.push(questionDoc)
      }
    }
    finalOutput = {
      test: {
        Questions: {
          Question: finalQuestionDocs
        }
      },
      output: cardObj?.platformresponse?.response?.[0]?.workflowoutcome?.[0]._ || 'Fail',
      details: {}
    }
  } else {
    const jObj = identityDataResponse.fillAPIResponseDoc;
    if (jObj) {
      const tempResponse = jObj.PlatformResponse && jObj.PlatformResponse.Response || {};
      if (tempResponse && tempResponse.Questions && tempResponse.Questions.Question &&
          tempResponse.Questions.Question.length < 10) {
        const newQuestionsNeeded = 10 - tempResponse.Questions.Question.length;
        console.log('newQuestionsNeeded', newQuestionsNeeded)
        for (let i = 0; i < newQuestionsNeeded; i += 1) {
          const questionDoc = tempResponse.Questions.Question[i];
          // if (demo && user.testingacc) {
          // // if (demo) {
          //   questionDoc.Answer = _.map(questionDoc.Answer, (answerDoc) => {
          //     delete answerDoc["@_correct"]
          //     return answerDoc
          //   })
          // }
          tempResponse.Questions.Question.push(questionDoc)
        }
      }
      finalOutput = {
        test: tempResponse,
        output: tempResponse.WorkflowOutcome && tempResponse.WorkflowOutcome.text || 'Fail',
        details: tempResponse.StandardizedAddress || {}
      }
    } else if (identityDataResponse.consumerPlusAPIResponseDoc) {
      const tempObj = identityDataResponse.consumerPlusAPIResponseDoc
      const tempResponse = tempObj.PlatformResponse && tempObj.PlatformResponse.Response || {};
      if (tempResponse && tempResponse.Questions && tempResponse.Questions.Question &&
          tempResponse.Questions.Question.length < 10) {
        const newQuestionsNeeded = 10 - tempResponse.Questions.Question.length;
        console.log('newQuestionsNeeded', newQuestionsNeeded)
        for (let i = 0; i < newQuestionsNeeded; i += 1) {
          const questionDoc = tempResponse.Questions.Question[i];
          // if (demo && user.testingacc) {
          // // if (demo) {
          //   questionDoc.Answer = _.map(questionDoc.Answer, (answerDoc) => {
          //     delete answerDoc["@_correct"]
          //     return answerDoc
          //   })
          // }
          tempResponse.Questions.Question.push(questionDoc)
        }
      }
      finalOutput = {
        test: tempResponse,
        output: tempResponse.WorkflowOutcome && tempResponse.WorkflowOutcome.text || 'Fail',
        details: tempResponse.StandardizedAddress || {}
      }
    }
  }
  res.status(200).json(finalOutput)
};

exports.getCustomerDetailsAfterChecking = async (req, res) => {
  const user = req.user
  const sessionid = req.params && req.params.id
  const biometrics = req.body && req.body.biometrics
  if (!sessionid) {
    res.status(400).json({
      error: 'Session id not found'
    })
  }
  const finalResponseData = {
    customerUser: null,
    identityDataResponse: null
  };
  const newSessionModelData = await NewSessionModel.findOne({
    _id: sessionid
  })
  // let typeOfKBA = ""
  // if (newSessionModelData && newSessionModelData.typeOfKBA) {
  //   typeOfKBA = newSessionModelData.typeOfKBA
  // }
  let identityDataResponse = {
    firstName: null,
    lastName: null,
    frontPhotoIdUrl: null,
    backPhotoIdUrl: null,
    fillAPIResponseDoc: null,
    userSsn: null,
    typeOfPhotoId: null,
    cardAPIResponseDoc: null
  }
  let identityModelQuery
  if (user.role === 'customer') {
    identityModelQuery = {
      sessionid: String(sessionid),
      userId: user._id
    }
  } else {
    identityModelQuery = {
      sessionid: String(sessionid)
    }
  }
  if (newSessionModelData.userId) {
    const customerUser = await User.findOne({
      _id: newSessionModelData.userId
    })
    if (customerUser) {
      finalResponseData.customerUser = customerUser
    }
    identityDataResponse = await IdentityModel.findOne(identityModelQuery)
    if (identityDataResponse) {
      finalResponseData.identityDataResponse = identityDataResponse
    }
  }
  if (!(identityDataResponse && identityDataResponse.firstName)) {
    return res.status(400).json({
      error: 'Identities Data Not Found'
    })
  }

  console.log(identityDataResponse)

  let fetchDataFromFillApi = process.env.NODE_ENV !== 'development';
  if (identityDataResponse.cardAPIResponseDoc) {
    fetchDataFromFillApi = false
  }
  const demo = req.query.demo ? true : false;
  console.log('demo: ',  demo, req.query.demo);
  if (demo && demo === true) {
    fetchDataFromFillApi = false;
  }
  // const fetchDataFromFillApi = true;
  const typeOfPhotoId = identityDataResponse.typeOfPhotoId || 'drivinglicense'
  console.log('fetchDataFromFillApi', fetchDataFromFillApi)
  console.log('typeOfPhotoId', typeOfPhotoId)
  if (!fetchDataFromFillApi) {
    // let apiResponse = {
    //   '?xml': { '@_version': '1.0', '@_encoding': 'utf-8', '@_standalone': 'yes' },
    //   'PlatformResponse': {
    //     TransactionDetails: {
    //       TransactionId: 65553996,
    //       TransactionDate: '2022-06-08T17:44:05.46',
    //       Product: { '@_name': 'IdentiFraud Fill', '@_version': '2.2.0' },
    //       CustomerReference: 'E27368-5C86555C-51B1-4175-B5EA-DDD6B7852F02',
    //       DataProviderDuration: 3.487,
    //       TotalDuration: 6.6649326,
    //       Errors: '',
    //       Warnings: {
    //         Warning: [
    //           {
    //             '@_message': 'Current Zip Code contains some invalid characters and they have been removed'
    //           },
    //           {
    //             '@_message': 'Driver License Number contains some invalid characters and they have been removed'
    //           }
    //         ]
    //       }
    //     },
    //     Response: {
    //       WorkflowOutcome: { 'text': 'Pass', '@_code': 'P' },
    //       ParseResult: {
    //         DocumentValidationResult: {
    //           'text': 'Successfully processed the image and the document appears valid.',
    //           '@_code': 'V'
    //         },
    //         DocumentExpirationResult: { 'text': 'The document has not expired.', '@_code': 'NE' },
    //         ParsedName: {
    //           FullName: 'ANDREW RYAN AYER',
    //           NamePrefix: '',
    //           FirstName: 'ANDREW',
    //           MiddleName: 'RYAN',
    //           LastName: 'AYER',
    //           NameSuffix: ''
    //         },
    //         ParsedAddress: {
    //           Address1: '13584 N STATE ROAD 62',
    //           Address2: '',
    //           City: 'GENTRYVILLE',
    //           JurisdictionCode: 'IN',
    //           PostalCode: '47537-0000',
    //           CountryCode: 'USA',
    //           Country: 'United States of America'
    //         },
    //         ParsedDescription: {
    //           DateOfBirth: '1984-06-05',
    //           Age: 38,
    //           Gender: 'Male',
    //           EyeColor: 'Brown',
    //           HairColor: 'Brown',
    //           Race: '',
    //           Height: '073 IN',
    //           WeightKg: 84,
    //           WeightLbs: 185,
    //           Veteran: '',
    //           OrganDonor: 'True'
    //         },
    //         ParsedDocumentInfo: {
    //           LicenseNumber: '1820-05-2403',
    //           DocumentType: 'DL',
    //           IssuerIdentificationNumber: 636037,
    //           IssuedBy: 'IN',
    //           IssueDate: '2020-11-19',
    //           ExpirationDate: '2027-06-05',
    //           CardRevisionDate: '2018-07-24',
    //           ClassificationCode: '',
    //           ComplianceType: 'F',
    //           LimitedDurationDocument: '',
    //           HazmatExpDate: '',
    //           EndorsementsCode: '',
    //           EndorsementCodeDescription: '',
    //           RestrictionCode: '',
    //           RestrictionCodeDescription: '',
    //           VehicleClassCode: '',
    //           VehicleClassCodeDescription: ''
    //         }
    //       },
    //       PrimaryResult: { '@_code': '00' },
    //       CheckpointScore: '',
    //       AuthenticationScore: '',
    //       ValidationScore: '',
    //       VerificationScore: '',
    //       NameFlipIndicator: { '@_code': '' },
    //       AddressVerificationResult: { 'text': 'Match to other Associated Address.', '@_code': 'W' },
    //       AddressUnitMismatchResult: { '@_code': '' },
    //       AddressTypeResult: {
    //         'text': 'Submitted address is residential address.',
    //         '@_code': 'S'
    //       },
    //       AddressHighRiskResult: {
    //         'text': 'No address high risk information found for submitted address.',
    //         '@_code': 'N'
    //       },
    //       PhoneVerificationResult: { 'text': 'Phone number is missing', '@_code': 'MX' },
    //       PhoneUnitMismatchResult: { '@_code': '' },
    //       PhoneHighRiskResult: { 'text': 'No phone high risk information found.', '@_code': 'N' },
    //       ChangeOfAddressResult: {
    //         'text': 'No change of address information was found.',
    //         '@_code': 'N'
    //       },
    //       DriverLicenseResult: {
    //         'text': 'Submitted DL state and number not on file.',
    //         '@_code': 'NI'
    //       },
    //       DriverLicenseFormat: {
    //         'text': 'Driver\'s license number is a valid format for state.',
    //         '@_code': 'V'
    //       },
    //       SocialSecurityNumberResult: {
    //         'text': 'Match to full name and address using entered name and address.',
    //         '@_code': 'YB'
    //       },
    //       DateOfBirthResult: {
    //         'text': 'Full DOB available and input matches exactly.',
    //         '@_code': '9'
    //       },
    //       ExclusionCondition: { '@_code': '' },
    //       EmailVerificationResult: { '@_code': '' },
    //       EmailValidationResult: { '@_code': '' },
    //       EmailReasonResult: { '@_code': '' },
    //       EmailRepositoryResult: { '@_code': '' },
    //       MinorResult: { 'text': 'The matched consumer is an adult.', '@_code': 'N' },
    //       ReportedFraudResult: {
    //         'text': 'No fraud has been reported for the matched consumer',
    //         '@_code': 'N'
    //       },
    //       StandardizedAddress: {
    //         LastName: 'AYER',
    //         FirstName: 'ANDREW',
    //         MiddleInitial: 'R',
    //         Street: '13584 N STATE ROAD 62',
    //         City: 'GENTRYVILLE',
    //         State: 'IN',
    //         ZipCode: 47537,
    //         ZipPlusFour: 6211
    //       },
    //       DateOfBirth: { Day: 5, Month: 6, Year: 1984 },
    //       HighRiskPhoneMatches: '',
    //       HighRiskAddressMatches: '',
    //       ConsumerIdDetail: {
    //         LastName: 'AYER',
    //         FirstName: 'ANDREW',
    //         MiddleInitial: '',
    //         Street: '13584 N STATE ROAD 62',
    //         City: 'GENTRYVILLE',
    //         State: 'IN',
    //         ZipCode: 47537,
    //         ZipPlusFour: 6211,
    //         AreaCode: '',
    //         Phone: '',
    //         DateOfBirth: '',
    //         DateOfBirthResult: { '@_code': '' },
    //         ReportedDate: { Day: 21, Month: 4, Year: 2014 },
    //         LastTouchedDate: { Day: 19, Month: 4, Year: 2022 }
    //       },
    //       SsnFinderDetails: {
    //         SsnFinderDetail: {
    //           LastName: 'AYER',
    //           FirstName: 'ANDREW',
    //           MiddleInitial: '',
    //           AliasName: '',
    //           Street: '13584 N STATE ROAD 62',
    //           City: 'GENTRYVILLE',
    //           State: 'IN',
    //           ZipCode: 47537,
    //           ZipPlusFour: 6211,
    //           AreaCode: '',
    //           Phone: '',
    //           SsnOnFile: '',
    //           DateOfBirth: '',
    //           DateOfBirthResult: {
    //             'text': 'Full DOB available and input matches exactly.',
    //             '@_code': '9'
    //           },
    //           ReportedDate: { Day: 21, Month: 4, Year: 2014 },
    //           LastTouchedDate: '',
    //           Result: { '@_code': 'FY' }
    //         }
    //       },
    //       ResidentialPhoneDetails: '',
    //       ResidentialAddressDetails: {
    //         ResidentialAddressDetail: {
    //           LastName: 'BENDER',
    //           FirstName: 'MIKE',
    //           MiddleInitial: 'A',
    //           AliasName: '',
    //           Street: '13584 N STATE ROAD 62',
    //           City: 'GENTRYVILLE',
    //           State: 'IN',
    //           ZipCode: 47537,
    //           ZipPlusFour: 6211,
    //           AreaCode: '',
    //           Phone: '',
    //           SpouseName: '',
    //           HouseMember: [ 'BECKY', 'SHANNON', 'MIKE' ],
    //           LastTouchedDate: { Day: 6, Month: 5, Year: 2022 },
    //           ReportedDate: '',
    //           ResidenceLength: 268
    //         }
    //       },
    //       SsnValidation: {
    //         DeceasedResult: {
    //           'text': 'Not deceased - no matching files found on the death master list.',
    //           '@_code': 'N'
    //         },
    //         FormatResult: { '@_code': '' },
    //         IssueResult: {
    //           'text': 'Social Security Number has been issued with a beginning and ending date.',
    //           '@_code': 'I'
    //         },
    //         StateIssued: 'IN',
    //         IssueStartRange: 1987,
    //         IssueEndRange: 1989
    //       },
    //       ChangeOfAddress: '',
    //       PreviousAddresses: {
    //         PreviousAddress: [
    //           {
    //             Street: '13584 N STATE ROAD 62',
    //             City: 'GENTRYVILLE',
    //             State: 'IN',
    //             ZipCode: 47537,
    //             ZipPlusFour: 6211,
    //             ReportDate: { Day: 21, Month: 4, Year: 2014 },
    //             UpdateDate: { Day: 19, Month: 4, Year: 2022 }
    //           },
    //           {
    //             Street: '808 N OAKLEY BLVD APT 1',
    //             City: 'CHICAGO',
    //             State: 'IL',
    //             ZipCode: 60622,
    //             ZipPlusFour: 4775,
    //             ReportDate: { Day: 4, Month: 12, Year: 2011 },
    //             UpdateDate: { Day: 2, Month: 3, Year: 2019 }
    //           }
    //         ]
    //       },
    //       AdditionalAddresses: {
    //         AdditionalAddress: [
    //           {
    //             Street: '3267 W WRIGHTWOOD AVE APT 1AA',
    //             City: 'CHICAGO',
    //             State: 'IL',
    //             ZipCode: 60647,
    //             ZipPlusFour: 1646,
    //             ReportDate: { Day: 1, Month: 1, Year: 2018 },
    //             UpdateDate: { Day: 7, Month: 2, Year: 2019 }
    //           },
    //           {
    //             Street: '2556 W CHICAGO AVE',
    //             City: 'CHICAGO',
    //             State: 'IL',
    //             ZipCode: 60622,
    //             ZipPlusFour: 4517,
    //             ReportDate: { Day: 24, Month: 8, Year: 2016 },
    //             UpdateDate: { Day: 9, Month: 11, Year: 2017 }
    //           },
    //           {
    //             Street: '2215 W IOWA ST # 1F',
    //             City: 'CHICAGO',
    //             State: 'IL',
    //             ZipCode: 60622,
    //             ZipPlusFour: 4844,
    //             ReportDate: { Day: 10, Month: 11, Year: 2014 },
    //             UpdateDate: { Day: 3, Month: 10, Year: 2015 }
    //           },
    //           {
    //             Street: '1316 N WESTERN AVE APT 2R',
    //             City: 'CHICAGO',
    //             State: 'IL',
    //             ZipCode: 60622,
    //             ZipPlusFour: 7242,
    //             ReportDate: { Day: 13, Month: 9, Year: 2013 },
    //             UpdateDate: { Day: 5, Month: 11, Year: 2013 }
    //           },
    //           {
    //             Street: '2752 N TROY ST # 2',
    //             City: 'CHICAGO',
    //             State: 'IL',
    //             ZipCode: 60647,
    //             ZipPlusFour: 1508,
    //             ReportDate: { Day: 14, Month: 9, Year: 2013 },
    //             UpdateDate: { Day: 14, Month: 9, Year: 2013 }
    //           },
    //           {
    //             Street: '2507 W AUGUSTA BLVD',
    //             City: 'CHICAGO',
    //             State: 'IL',
    //             ZipCode: 60622,
    //             ZipPlusFour: 4575,
    //             ReportDate: { Day: 15, Month: 12, Year: 2012 },
    //             UpdateDate: { Day: 21, Month: 2, Year: 2013 }
    //           },
    //           {
    //             Street: '2756 N TROY ST APT 2',
    //             City: 'CHICAGO',
    //             State: 'IL',
    //             ZipCode: 60647,
    //             ZipPlusFour: 1508,
    //             ReportDate: { Day: 9, Month: 8, Year: 2010 },
    //             UpdateDate: { Day: 25, Month: 5, Year: 2012 }
    //           },
    //           {
    //             Street: '3200 W CARROLL AVE',
    //             City: 'CHICAGO',
    //             State: 'IL',
    //             ZipCode: 60624,
    //             ZipPlusFour: 2030,
    //             ReportDate: { Day: 17, Month: 8, Year: 2009 },
    //             UpdateDate: { Day: 22, Month: 4, Year: 2010 }
    //           },
    //           {
    //             Street: '1922 N WASHTENAW AVE APT 2F',
    //             City: 'CHICAGO',
    //             State: 'IL',
    //             ZipCode: 60647,
    //             ZipPlusFour: 6697,
    //             ReportDate: { Day: 5, Month: 3, Year: 2009 },
    //             UpdateDate: { Day: 5, Month: 6, Year: 2009 }
    //           }
    //         ]
    //       },
    //       FraudShieldResults: {
    //         FraudShield01: { '@_code': 'N' },
    //         FraudShield02: { '@_code': 'N' },
    //         FraudShield03: { '@_code': 'N' },
    //         FraudShield04: { '@_code': 'N' },
    //         FraudShield05: { '@_code': 'N' },
    //         FraudShield06: { '@_code': 'N' },
    //         FraudShield10: { '@_code': 'N' },
    //         FraudShield11: { '@_code': 'N' },
    //         FraudShield13: { '@_code': 'N' },
    //         FraudShield14: { '@_code': 'N' },
    //         FraudShield15: { '@_code': 'N' },
    //         FraudShield16: { '@_code': 'N' },
    //         FraudShield17: { '@_code': 'N' },
    //         FraudShield18: { '@_code': 'N' },
    //         FraudShield21: { '@_code': 'N' },
    //         FraudShield25: { '@_code': 'N' },
    //         FraudShield26: { '@_code': 'N' },
    //         FraudShield27: { '@_code': '' }
    //       },
    //       SharedApplicationResults: {
    //         GlbRule01: { '@_code': '' },
    //         GlbRule02: { '@_code': '' },
    //         GlbRule03: { '@_code': '' },
    //         GlbRule04: { '@_code': '' },
    //         GlbRule05: { '@_code': '' },
    //         GlbRule06: { '@_code': '' },
    //         GlbRule07: { '@_code': '' },
    //         GlbRule08: { '@_code': '' },
    //         GlbRule09: { '@_code': '' },
    //         GlbRule10: { '@_code': '' },
    //         GlbRule11: { '@_code': '' },
    //         GlbRule12: { '@_code': '' },
    //         GlbRule13: { '@_code': '' },
    //         GlbRule14: { '@_code': '' },
    //         GlbRule15: { '@_code': '' },
    //         GlbRule16: { '@_code': '' },
    //         GlbRule17: { '@_code': '' },
    //         GlbRule18: { '@_code': '' },
    //         GlbRule19: { '@_code': '' },
    //         GlbRule20: { '@_code': '' }
    //       },
    //       InitialResults: {
    //         AuthenticationIndex: '',
    //         MostLikelyFraudType: { '@_code': '' },
    //         InitialDecision: { '@_code': '' },
    //         FinalDecision: { '@_code': '' },
    //         Reasons: {
    //           Reason1: { '@_code': '' },
    //           Reason2: { '@_code': '' },
    //           Reason3: { '@_code': '' },
    //           Reason4: { '@_code': '' },
    //           Reason5: { '@_code': '' }
    //         }
    //       },
    //       SecondaryResults: {
    //         AuthenticationIndex: '',
    //         MostLikelyFraudType: { '@_code': '' },
    //         InitialDecision: { '@_code': '' },
    //         FinalDecision: { '@_code': '' },
    //         Reasons: {
    //           Reason1: { '@_code': '' },
    //           Reason2: { '@_code': '' },
    //           Reason3: { '@_code': '' },
    //           Reason4: { '@_code': '' },
    //           Reason5: { '@_code': '' }
    //         }
    //       },
    //       EmailAddressDetails: '',
    //       IpAddressDetail: '',
    //       OfacValidation: {
    //         OfacValidationResult: { 'text': 'No match to name or address.', '@_code': '1' }
    //       },
    //       Questions: {
    //         Question: [
    //           {
    //             'Answer': [
    //               { 'text': '2556 W CHICAGO AVE', '@_correct': 'true' },
    //               { 'text': '936 136TH PL', '@_correct': 'false' },
    //               { 'text': '2071 KEDUALE', '@_correct': 'false' },
    //               { 'text': '3031 KARLOV AV', '@_correct': 'false' },
    //               { 'text': 'None of the above', '@_correct': 'false' }
    //             ],
    //             '@_type': '1',
    //             '@_text': 'Which one of the following addresses is associated with you?'
    //           },
    //           {
    //             'Answer': [
    //               { 'text': 847, '@_correct': 'false' },
    //               { 'text': 773, '@_correct': 'true' },
    //               { 'text': 618, '@_correct': 'false' },
    //               { 'text': 816, '@_correct': 'false' },
    //               { 'text': 'None of the above', '@_correct': 'false' }
    //             ],
    //             '@_type': '2',
    //             '@_text': 'Which one of the following area codes is associated with you?'
    //           },
    //           {
    //             'Answer': [
    //               { 'text': 'Adair', '@_correct': 'false' },
    //               { 'text': 'Cook', '@_correct': 'true' },
    //               { 'text': 'Hancock', '@_correct': 'false' },
    //               { 'text': 'Edwards', '@_correct': 'false' },
    //               { 'text': 'None of the above', '@_correct': 'false' }
    //             ],
    //             '@_type': '3',
    //             '@_text': 'Which one of the following counties is associated with you?'
    //           },
    //           {
    //             'Answer': [
    //               { 'text': 60334, '@_correct': 'false' },
    //               { 'text': 60000, '@_correct': 'false' },
    //               { 'text': 60665, '@_correct': 'false' },
    //               { 'text': 60622, '@_correct': 'true' },
    //               { 'text': 'None of the above', '@_correct': 'false' }
    //             ],
    //             '@_type': '4',
    //             '@_text': 'Which one of the following zip codes is associated with you?'
    //           },
    //           {
    //             'Answer': [
    //               { 'text': 'Indiana', '@_correct': 'true' },
    //               { 'text': 'Oregon', '@_correct': 'false' },
    //               { 'text': 'Louisiana', '@_correct': 'false' },
    //               { 'text': 'Alabama', '@_correct': 'false' },
    //               { 'text': 'None of the above', '@_correct': 'false' }
    //             ],
    //             '@_type': '5',
    //             '@_text': 'What state was your SSN issued in?'
    //           },
    //           {
    //             'Answer': [
    //               { 'text': 'Noah', '@_correct': 'false' },
    //               { 'text': 'Rafael', '@_correct': 'false' },
    //               { 'text': 'Becky', '@_correct': 'true' },
    //               { 'text': 'Jessica', '@_correct': 'false' },
    //               { 'text': 'None of the above', '@_correct': 'false' }
    //             ],
    //             '@_type': '6',
    //             '@_text': 'Which one of the following adult individuals is most closely associated with you?'
    //           },
    //           {
    //             'Answer': [
    //               { 'text': 699, '@_correct': 'false' },
    //               { 'text': 336, '@_correct': 'false' },
    //               { 'text': 401, '@_correct': 'false' },
    //               { 'text': 100, '@_correct': 'false' },
    //               { 'text': 'None of the above', '@_correct': 'true' }
    //             ],
    //             '@_type': '8',
    //             '@_text': 'What are the first 3 digits of your SSN?'
    //           },
    //           {
    //             'Answer': [
    //               { 'text': 60665, '@_correct': 'false' },
    //               { 'text': 60262, '@_correct': 'false' },
    //               { 'text': 60647, '@_correct': 'true' },
    //               { 'text': 60000, '@_correct': 'false' },
    //               { 'text': 'None of the above', '@_correct': 'false' }
    //             ],
    //             '@_type': '9',
    //             '@_text': 'What was the zip code for the address on N TROY ST # 2?'
    //           },
    //           {
    //             'Answer': [
    //               { 'text': 6691, '@_correct': 'false' },
    //               { 'text': 2701, '@_correct': 'false' },
    //               { 'text': 2752, '@_correct': 'true' },
    //               { 'text': 109, '@_correct': 'false' },
    //               { 'text': 'None of the above', '@_correct': 'false' }
    //             ],
    //             '@_type': '10',
    //             '@_text': 'What was the house number for the address on N TROY ST # 2?'
    //           }
    //         ]
    //       }
    //     }
    //   }
    // }
    // if (identityDataResponse.fillAPIResponseDoc) {
    //   apiResponse = identityDataResponse.fillAPIResponseDoc
    // } else {
    //   const newIdentityDataResponse = await IdentityModel.findOne(identityModelQuery);
    //   newIdentityDataResponse.fillAPIResponseDoc = apiResponse
    //   newIdentityDataResponse.save()
    // }
    let apiResponse = {
      platformresponse : {
          transactiondetails : [
              {
                  transactionid : [
                      '65934582'
                  ],
                  transactiondate : [
                      '2022-06-30T15:54:15.66'
                  ],
                  product : [
                      {
                          temp : {
                              name : 'IdentiFraud Card',
                              version : '2.2.0'
                          }
                      }
                  ],
                  customerreference : [
                      'USER_6224ba9ef5473b2bd5e2681c_448'
                  ],
                  dataproviderduration : [
                      '0'
                  ],
                  totalduration : [
                      '1.257'
                  ],
                  errors : [
                      ''
                  ],
                  warnings : [
                      ''
                  ]
              }
          ],
          response : [
              {
                  workflowoutcome : [
                      {
                          _ : 'Pass',
                          temp : {
                              code : 'F'
                          }
                      }
                  ],
                  cardresult : [
                      {
                          validationresult : [
                              {
                                  _ : 'The document has passed the check.',
                                  temp : {
                                      code : '0'
                                  }
                              }
                          ],
                          imageparsingresult : [
                              {
                                  _ : 'Both sides of the document were successfully parsed.',
                                  temp : {
                                      code : 'B'
                                  }
                              }
                          ],
                          totalconfidence : [
                              '87'
                          ],
                          documentinformation : [
                              {
                                  licensenumber : [
                                      {
                                          _ : '890051357',
                                          temp : {
                                              confidence : '88'
                                          }
                                      }
                                  ],
                                  documenttype : [
                                      'DL'
                                  ],
                                  issuedate : [
                                      '2021-10-01'
                                  ],
                                  expirationdate : [
                                      '2026-09-25'
                                  ],
                                  documentclass : [
                                      'D'
                                  ],
                                  template : [
                                      '03'
                                  ]
                              }
                          ],
                          documentname : [
                              {
                                  fullname : [
                                      {
                                          _ : 'JOENNY DIAZ VIDAL',
                                          temp : {
                                              confidence : '50'
                                          }
                                      }
                                  ],
                                  firstname : [
                                      'JOENNY'
                                  ],
                                  privatename : [
                                      'JOENNY'
                                  ],
                                  middlename : [
                                      'JOENNY'
                                  ],
                                  familyname : [
                                      'DIAZ VIDAL'
                                  ]
                              }
                          ],
                          documentaddress : [
                              {
                                  address : [
                                      {
                                          _ : '3221 108TH ST FL 2',
                                          temp : {
                                              confidence : '82'
                                          }
                                      }
                                  ],
                                  city : [
                                      'EAST ELMHURST'
                                  ],
                                  state : [
                                      'NY'
                                  ],
                                  zipcode : [
                                      '11369-0000'
                                  ],
                                  country : [
                                      'United States of America'
                                  ]
                              }
                          ],
                          individualcharacteristics : [
                              {
                                  dateofbirth : [
                                      {
                                          _ : '1994-09-25',
                                          temp : {
                                              confidence : '100'
                                          }
                                      }
                                  ],
                                  age : [
                                      '27'
                                  ],
                                  gender : [
                                      'FEMALE'
                                  ],
                                  eyecolor : [
                                      'BROWN'
                                  ],
                                  haircolor : [
                                      ''
                                  ],
                                  height : [
                                      '63'
                                  ],
                                  weight : [
                                      ''
                                  ]
                              }
                          ]
                      }
                  ],
                  primaryresult : [
                      {
                          temp : {
                              code : '00'
                          }
                      }
                  ],
                  checkpointscore : [
                      ''
                  ],
                  authenticationscore : [
                      ''
                  ],
                  validationscore : [
                      ''
                  ],
                  verificationscore : [
                      ''
                  ],
                  nameflipindicator : [
                      {
                          temp : {
                              code : ''
                          }
                      }
                  ],
                  addressverificationresult : [
                      {
                          _ : 'No match on name; No match on address',
                          temp : {
                              code : 'X0'
                          }
                      }
                  ],
                  addressunitmismatchresult : [
                      {
                          temp : {
                              code : ''
                          }
                      }
                  ],
                  addresstyperesult : [
                      {
                          _ : 'Submitted address is a residential multi family dwelling.',
                          temp : {
                              code : 'M'
                          }
                      }
                  ],
                  addresshighriskresult : [
                      {
                          _ : 'No address high risk information found for submitted address.',
                          temp : {
                              code : 'N'
                          }
                      }
                  ],
                  phoneverificationresult : [
                      {
                          _ : 'Phone number is missing',
                          temp : {
                              code : 'MX'
                          }
                      }
                  ],
                  phoneunitmismatchresult : [
                      {
                          temp : {
                              code : ''
                          }
                      }
                  ],
                  phonehighriskresult : [
                      {
                          _ : 'No phone high risk information found.',
                          temp : {
                              code : 'N'
                          }
                      }
                  ],
                  changeofaddressresult : [
                      {
                          _ : 'No change of address information was found.',
                          temp : {
                              code : 'N'
                          }
                      }
                  ],
                  driverlicenseresult : [
                      {
                          _ : 'DL number not submitted.',
                          temp : {
                              code : 'M'
                          }
                      }
                  ],
                  driverlicenseformat : [
                      {
                          temp : {
                              code : ''
                          }
                      }
                  ],
                  socialsecuritynumberresult : [
                      {
                          _ : 'Social Security Number does not match name or address.',
                          temp : {
                              code : 'N'
                          }
                      }
                  ],
                  dateofbirthresult : [
                      {
                          _ : 'Consumer not on file – no record.',
                          temp : {
                              code : '5'
                          }
                      }
                  ],
                  exclusioncondition : [
                      {
                          temp : {
                              code : ''
                          }
                      }
                  ],
                  emailverificationresult : [
                      {
                          temp : {
                              code : ''
                          }
                      }
                  ],
                  emailvalidationresult : [
                      {
                          temp : {
                              code : ''
                          }
                      }
                  ],
                  emailreasonresult : [
                      {
                          temp : {
                              code : ''
                          }
                      }
                  ],
                  emailrepositoryresult : [
                      {
                          temp : {
                              code : ''
                          }
                      }
                  ],
                  minorresult : [
                      {
                          _ : 'The matched consumer is an adult.',
                          temp : {
                              code : 'N'
                          }
                      }
                  ],
                  reportedfraudresult : [
                      {
                          _ : 'No fraud has been reported for the matched consumer',
                          temp : {
                              code : 'N'
                          }
                      }
                  ],
                  standardizedaddress : [
                      {
                          lastname : [
                              'DIAZVIDAL'
                          ],
                          firstname : [
                              'JOENNY'
                          ],
                          middleinitial : [
                              'J'
                          ],
                          street : [
                              '3221 108TH ST FL 2'
                          ],
                          city : [
                              'EAST ELMHURST'
                          ],
                          state : [
                              'NY'
                          ],
                          zipcode : [
                              '11369'
                          ],
                          zipplusfour : [
                              '2523'
                          ]
                      }
                  ],
                  dateofbirth : [
                      ''
                  ],
                  highriskphonematches : [
                      ''
                  ],
                  highriskaddressmatches : [
                      ''
                  ],
                  consumeriddetail : [
                      ''
                  ],
                  ssnfinderdetails : [
                      ''
                  ],
                  residentialphonedetails : [
                      ''
                  ],
                  residentialaddressdetails : [
                      ''
                  ],
                  ssnvalidation : [
                      {
                          deceasedresult : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          formatresult : [
                              {
                                  _ : 'Social Security Number is valid per Social Security Administration files.',
                                  temp : {
                                      code : 'V'
                                  }
                              }
                          ],
                          issueresult : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          stateissued : [
                              ''
                          ],
                          issuestartrange : [
                              ''
                          ],
                          issueendrange : [
                              ''
                          ]
                      }
                  ],
                  changeofaddress : [
                      ''
                  ],
                  previousaddresses : [
                      {
                          previousaddress : [
                              {
                                  street : [
                                      '3221 108TH ST APT 2'
                                  ],
                                  city : [
                                      'EAST ELMHURST'
                                  ],
                                  state : [
                                      'NY'
                                  ],
                                  zipcode : [
                                      '11369'
                                  ],
                                  zipplusfour : [
                                      '2523'
                                  ],
                                  reportdate : [
                                      {
                                          day : [
                                              '01'
                                          ],
                                          month : [
                                              '08'
                                          ],
                                          year : [
                                              '2017'
                                          ]
                                      }
                                  ],
                                  updatedate : [
                                      {
                                          day : [
                                              '15'
                                          ],
                                          month : [
                                              '06'
                                          ],
                                          year : [
                                              '2022'
                                          ]
                                      }
                                  ]
                              },
                              {
                                  street : [
                                      '115 PARK AVE APT 13'
                                  ],
                                  city : [
                                      'PATERSON'
                                  ],
                                  state : [
                                      'NJ'
                                  ],
                                  zipcode : [
                                      '07501'
                                  ],
                                  zipplusfour : [
                                      '2351'
                                  ],
                                  reportdate : [
                                      {
                                          day : [
                                              '09'
                                          ],
                                          month : [
                                              '06'
                                          ],
                                          year : [
                                              '2019'
                                          ]
                                      }
                                  ],
                                  updatedate : [
                                      {
                                          day : [
                                              '07'
                                          ],
                                          month : [
                                              '05'
                                          ],
                                          year : [
                                              '2021'
                                          ]
                                      }
                                  ]
                              }
                          ]
                      }
                  ],
                  additionaladdresses : [
                      {
                          additionaladdress : [
                              {
                                  street : [
                                      '9 WHEELER POINT RD'
                                  ],
                                  city : [
                                      'NEWARK'
                                  ],
                                  state : [
                                      'NJ'
                                  ],
                                  zipcode : [
                                      '07105'
                                  ],
                                  zipplusfour : [
                                      '3014'
                                  ],
                                  reportdate : [
                                      {
                                          day : [
                                              '04'
                                          ],
                                          month : [
                                              '05'
                                          ],
                                          year : [
                                              '2021'
                                          ]
                                      }
                                  ],
                                  updatedate : [
                                      {
                                          day : [
                                              '04'
                                          ],
                                          month : [
                                              '05'
                                          ],
                                          year : [
                                              '2021'
                                          ]
                                      }
                                  ]
                              },
                              {
                                  street : [
                                      '190 22ND AVE'
                                  ],
                                  city : [
                                      'PATERSON'
                                  ],
                                  state : [
                                      'NJ'
                                  ],
                                  zipcode : [
                                      '07513'
                                  ],
                                  zipplusfour : [
                                      '1343'
                                  ],
                                  reportdate : [
                                      {
                                          day : [
                                              '15'
                                          ],
                                          month : [
                                              '05'
                                          ],
                                          year : [
                                              '2019'
                                          ]
                                      }
                                  ],
                                  updatedate : [
                                      {
                                          day : [
                                              '07'
                                          ],
                                          month : [
                                              '01'
                                          ],
                                          year : [
                                              '2021'
                                          ]
                                      }
                                  ]
                              },
                              {
                                  street : [
                                      '9420 GUY R BREWER BLVD'
                                  ],
                                  city : [
                                      'JAMAICA'
                                  ],
                                  state : [
                                      'NY'
                                  ],
                                  zipcode : [
                                      '11451'
                                  ],
                                  zipplusfour : [
                                      '0001'
                                  ],
                                  reportdate : [
                                      {
                                          day : [
                                              '26'
                                          ],
                                          month : [
                                              '05'
                                          ],
                                          year : [
                                              '2018'
                                          ]
                                      }
                                  ],
                                  updatedate : [
                                      {
                                          day : [
                                              '26'
                                          ],
                                          month : [
                                              '05'
                                          ],
                                          year : [
                                              '2018'
                                          ]
                                      }
                                  ]
                              },
                              {
                                  street : [
                                      '511 UNION AVE'
                                  ],
                                  city : [
                                      'PATERSON'
                                  ],
                                  state : [
                                      'NJ'
                                  ],
                                  zipcode : [
                                      '07522'
                                  ],
                                  zipplusfour : [
                                      '1545'
                                  ],
                                  reportdate : [
                                      {
                                          day : [
                                              '20'
                                          ],
                                          month : [
                                              '10'
                                          ],
                                          year : [
                                              '2018'
                                          ]
                                      }
                                  ],
                                  updatedate : [
                                      {
                                          day : [
                                              '20'
                                          ],
                                          month : [
                                              '10'
                                          ],
                                          year : [
                                              '2018'
                                          ]
                                      }
                                  ]
                              }
                          ]
                      }
                  ],
                  fraudshieldresults : [
                      {
                          fraudshield01 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield02 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield03 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield04 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield05 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield06 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield10 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield11 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield13 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield14 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield15 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield16 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield17 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield18 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield21 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield25 : [
                              {
                                  temp : {
                                      code : 'N'
                                  }
                              }
                          ],
                          fraudshield26 : [
                              {
                                  _ : 'Best on-file SSN not issued as of MM/YY',
                                  temp : {
                                      code : 'Y'
                                  }
                              }
                          ],
                          fraudshield27 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ]
                      }
                  ],
                  sharedapplicationresults : [
                      {
                          glbrule01 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule02 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule03 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule04 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule05 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule06 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule07 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule08 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule09 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule10 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule11 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule12 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule13 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule14 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule15 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule16 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule17 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule18 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule19 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          glbrule20 : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ]
                      }
                  ],
                  initialresults : [
                      {
                          authenticationindex : [
                              ''
                          ],
                          mostlikelyfraudtype : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          initialdecision : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          finaldecision : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          reasons : [
                              {
                                  reason1 : [
                                      {
                                          temp : {
                                              code : ''
                                          }
                                      }
                                  ],
                                  reason2 : [
                                      {
                                          temp : {
                                              code : ''
                                          }
                                      }
                                  ],
                                  reason3 : [
                                      {
                                          temp : {
                                              code : ''
                                          }
                                      }
                                  ],
                                  reason4 : [
                                      {
                                          temp : {
                                              code : ''
                                          }
                                      }
                                  ],
                                  reason5 : [
                                      {
                                          temp : {
                                              code : ''
                                          }
                                      }
                                  ]
                              }
                          ]
                      }
                  ],
                  secondaryresults : [
                      {
                          authenticationindex : [
                              ''
                          ],
                          mostlikelyfraudtype : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          initialdecision : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          finaldecision : [
                              {
                                  temp : {
                                      code : ''
                                  }
                              }
                          ],
                          reasons : [
                              {
                                  reason1 : [
                                      {
                                          temp : {
                                              code : ''
                                          }
                                      }
                                  ],
                                  reason2 : [
                                      {
                                          temp : {
                                              code : ''
                                          }
                                      }
                                  ],
                                  reason3 : [
                                      {
                                          temp : {
                                              code : ''
                                          }
                                      }
                                  ],
                                  reason4 : [
                                      {
                                          temp : {
                                              code : ''
                                          }
                                      }
                                  ],
                                  reason5 : [
                                      {
                                          temp : {
                                              code : ''
                                          }
                                      }
                                  ]
                              }
                          ]
                      }
                  ],
                  emailaddressdetails : [
                      ''
                  ],
                  ipaddressdetail : [
                      ''
                  ],
                  ofacvalidation : [
                      {
                          ofacvalidationresult : [
                              {
                                  _ : 'No match to name or address.',
                                  temp : {
                                      code : '1'
                                  }
                              }
                          ]
                      }
                  ],
                  questions : [
                      {
                          question : [
                              {
                                  temp : {
                                      type : '1',
                                      text : 'Which one of the following addresses is associated with you?'
                                  },
                                  answer : [
                                      {
                                          _ : '56 DEJOR CI',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '32 BRIGHTON AV',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '9 WHEELER POINT RD',
                                          temp : {
                                              correct : 'true'
                                          }
                                      },
                                      {
                                          _ : '80 1ST FL',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : 'None of the above',
                                          temp : {
                                              correct : 'false'
                                          }
                                      }
                                  ]
                              },
                              {
                                  temp : {
                                      type : '2',
                                      text : 'Which one of the following area codes is associated with you?'
                                  },
                                  answer : [
                                      {
                                          _ : '603',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '508/774',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '973/862',
                                          temp : {
                                              correct : 'true'
                                          }
                                      },
                                      {
                                          _ : '631/934',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : 'None of the above',
                                          temp : {
                                              correct : 'false'
                                          }
                                      }
                                  ]
                              },
                              {
                                  temp : {
                                      type : '3',
                                      text : 'Which one of the following counties is associated with you?'
                                  },
                                  answer : [
                                      {
                                          _ : 'Ciales',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : 'Passaic',
                                          temp : {
                                              correct : 'true'
                                          }
                                      },
                                      {
                                          _ : 'Yabucoa',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : 'Maricao',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : 'None of the above',
                                          temp : {
                                              correct : 'false'
                                          }
                                      }
                                  ]
                              },
                              {
                                  temp : {
                                      type : '4',
                                      text : 'Which one of the following zip codes is associated with you?'
                                  },
                                  answer : [
                                      {
                                          _ : '11801',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '11030',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '11780',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '11451',
                                          temp : {
                                              correct : 'true'
                                          }
                                      },
                                      {
                                          _ : 'None of the above',
                                          temp : {
                                              correct : 'false'
                                          }
                                      }
                                  ]
                              },
                              {
                                  temp : {
                                      type : '6',
                                      text : 'Which one of the following adult individuals is most closely associated with you?'
                                  },
                                  answer : [
                                      {
                                          _ : 'Zachary',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : 'Daniel',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : 'Leahonia',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : 'Yanely',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : 'None of the above',
                                          temp : {
                                              correct : 'true'
                                          }
                                      }
                                  ]
                              },
                              {
                                  temp : {
                                      type : '8',
                                      text : 'What are the first 3 digits of your SSN?'
                                  },
                                  answer : [
                                      {
                                          _ : '127',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '743',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '802',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '820',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : 'None of the above',
                                          temp : {
                                              correct : 'true'
                                          }
                                      }
                                  ]
                              },
                              {
                                  temp : {
                                      type : '9',
                                      text : 'What was the zip code for the address on UNION AVE?'
                                  },
                                  answer : [
                                      {
                                          _ : '07030',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '07715',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '07522',
                                          temp : {
                                              correct : 'true'
                                          }
                                      },
                                      {
                                          _ : '07801',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : 'None of the above',
                                          temp : {
                                              correct : 'false'
                                          }
                                      }
                                  ]
                              },
                              {
                                  temp : {
                                      type : '10',
                                      text : 'What was the house number for the address on UNION AVE?'
                                  },
                                  answer : [
                                      {
                                          _ : '40',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '717',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : '511',
                                          temp : {
                                              correct : 'true'
                                          }
                                      },
                                      {
                                          _ : '803',
                                          temp : {
                                              correct : 'false'
                                          }
                                      },
                                      {
                                          _ : 'None of the above',
                                          temp : {
                                              correct : 'false'
                                          }
                                      }
                                  ]
                              }
                          ]
                      }
                  ]
              }
          ]
      }
    }
    if (identityDataResponse.cardAPIResponseDoc) {
      apiResponse = identityDataResponse.cardAPIResponseDoc
    } else {
      const newIdentityDataResponse = await IdentityModel.findOne(identityModelQuery);
      newIdentityDataResponse.cardAPIResponseDoc = apiResponse
      newIdentityDataResponse.save()
    }
    const responseDoc = apiResponse?.platformresponse?.response?.[0]
    if (!responseDoc) {
      res.status(200).json({
        workflowOutcome: 'Fail',
        reason: 'No Idea'
      })
    }
    const finalResponse = {
      apiStatus: 'We are processing your Passport'
    }
    res.status(200).json(finalResponse)
  } else {
    // below flow is used for fill api
    if (false) {
      const builder = new XMLBuilder();
      const newIdentityDataResponse = await IdentityModel.findOne(identityModelQuery);
      const backPhotoIdUrl = newIdentityDataResponse.backPhotoIdUrl.replace(/^https:\/\//i, 'http://');
      // const backPhotoIdUrl = 'http://bluenotarybucket.s3.us-east-
      // 2.amazonaws.com/1649582404008IMG_0467.jpg' // correct
      // const backPhotoIdUrl = 'http://bluenotarybuckey2.s3.us-east-2.amazonaws.com/1653009984695image.jpg' // incorect
      http.get(backPhotoIdUrl, (resp) => {
        resp.setEncoding('base64');
        let fileData = '';
        resp.on('data', (data) => {
          fileData += data;
        });
        resp.on('end', async () => {
          const sharpImage = await sharp(Buffer.from(fileData, 'base64')).resize({ width: 1500 }).toBuffer();
          const finalFileData = sharpImage.toString('base64')
          const jsObjectToSend = {
            PlatformRequest: {
              Credentials: {
                Username: 'E27368-65DCF76C-B477-4167-83F4-2E63D0690D4C',
                Password: 'nN0Q44tYmykA5ib'
              },
              CustomerReference: 'E27368-5C86555C-51B1-4175-B5EA-DDD6B7852F02',
              Identity: {
                ScanMode: 'DirectImageUpload',
                // FirstName: newIdentityDataResponse.firstName,
                // LastName: newIdentityDataResponse.lastName,
                // DateOfBirth: moment(newIdentityDataResponse.birthdate, 'YYYY/MM/DD').format('YYYY-MM-DD'),
                // Ssn: demo ? '222222222' : newIdentityDataResponse.userSsn,
                // Street: newIdentityDataResponse.addressLine1, // TODO : Uncomment when testing is done
                // ZipCode: newIdentityDataResponse.userZipCode, // TODO : Uncomment when testing is done
                BackImage: finalFileData
              }
            }
          }
          const xmlContent = builder.build(jsObjectToSend);
          const evsFillAPIUrl = 'https://identiflo.everification.net/WebServices/Integrated/Main/V220/Fill'
          const headers = {'Content-Type': 'application/xml'}
          console.log(xmlContent)
          console.log(evsFillAPIUrl)
          console.log('jsObjectToSend', jsObjectToSend)
          request.post({url: evsFillAPIUrl, body: xmlContent, headers}, (error1, response1, body1) => {
              const parser = new XMLParser({
                attributeNamePrefix : '@_',
                ignoreAttributes : false,
                ignoreNameSpace: false,
                textNodeName : 'text'
              });
              const apiResponse = parser.parse(body1);
              console.log(util.inspect(apiResponse, {showHidden: false, depth: null, colors: true}))
              const responseDoc = apiResponse && apiResponse.PlatformResponse
                && apiResponse.PlatformResponse.Response || false;
              if (newIdentityDataResponse) {
                newIdentityDataResponse.fillAPIResponseDoc = apiResponse;
                newIdentityDataResponse.save();
              }
              if (!responseDoc) {
                res.status(200).json({
                  workflowOutcome: 'Fail',
                  reson: 'No Idea'
                })
              }
              const allDetails = []
              const finalResponse = {
                allDetail: null,
                workflowOutcome: responseDoc && responseDoc.WorkflowOutcome && responseDoc.WorkflowOutcome.text
                ? responseDoc.WorkflowOutcome.text : '',
                documentValidationResult: responseDoc && responseDoc.ParseResult
                  && responseDoc.ParseResult.DocumentValidationResult &&
                  responseDoc.ParseResult.DocumentValidationResult.text || '',
                documentExpirationResult: responseDoc && responseDoc.ParseResult
                  && responseDoc.ParseResult.DocumentExpirationResult &&
                  responseDoc.ParseResult.DocumentExpirationResult.text || '',
                frontPhotoUrl: identityDataResponse.frontPhotoIdUrl || false,
                backPhotoUrl: identityDataResponse.backPhotoIdUrl || false
              }
              _.map(responseDoc && responseDoc.ParseResult, (resultValue, resultKey) => {
                if (['DocumentValidationResult', 'DocumentExpirationResult'].indexOf(resultKey) !== -1) {
                  return
                }
                _.map(resultValue, (innerResultValue, innerResultKey) => {
                  if (!innerResultValue) {
                    return
                  }
                  allDetails.push({
                    displayName: innerResultKey.replace(/([A-Z])/g, ' $1').trim(),
                    group: resultKey.replace(/([A-Z])/g, ' $1').trim(),
                    value: innerResultValue
                  })
                })
              })
              finalResponse.allDetail = allDetails
              res.status(200).json(finalResponse)
            });
            // return res.json({result: body, status: 'success'});
        });
      }).on('error', (e) => {
        res.status(400).json({
          error: e.message
        })
        // console.log(`Got error: ${e.message}`);
      });
    } else {
      const newIdentityDataResponse = await IdentityModel.findOne(identityModelQuery);
      const customerReferenceNumber = 'USER_' + String(user._id) + '_' + Math.floor(Math.random() * 999)
      newIdentityDataResponse.cardAPICustomerReferenceNumber = customerReferenceNumber;
      await newIdentityDataResponse.save()
      const frontPhotoIdUrl = newIdentityDataResponse.frontPhotoIdUrl &&
      newIdentityDataResponse.frontPhotoIdUrl.replace(/^https:\/\//i, 'http://');
      const backPhotoIdUrl = newIdentityDataResponse.backPhotoIdUrl &&
      newIdentityDataResponse.backPhotoIdUrl.replace(/^https:\/\//i, 'http://');
      // const backPhotoIdUrl = 'http://bluenotarybucket.s3.us-east-
      // 2.amazonaws.com/1649582404008IMG_0467.jpg' // correct
      // const backPhotoIdUrl = 'http://bluenotarybuckey2.s3.us-east-2.amazonaws.com/1653009984695image.jpg' // incorect
      http.get(frontPhotoIdUrl, (resp) => {
        resp.setEncoding('base64');
        let frontFileData = '';
        let backFileData = '';
        resp.on('data', (data) => {
          frontFileData += data;
        });
        resp.on('end', async () => {
          if (backPhotoIdUrl) {
            http.get(backPhotoIdUrl, (resp2) => {
              resp2.setEncoding('base64');
              resp2.on('data', (data) => {
                backFileData += data;
              });
              resp2.on('end', async () => {
                processEVSCardAPI(typeOfPhotoId, frontFileData, backFileData, customerReferenceNumber, biometrics, res)
              });
            }).on('error', (e) => {
              res.status(400).json({
                error: e.message
              })
            });
          } else {
            processEVSCardAPI(typeOfPhotoId, frontFileData, backFileData, customerReferenceNumber, biometrics, res)
          }
        });
      }).on('error', (e) => {
        res.status(400).json({
          error: e.message
        })
      });
    }
  }
};

exports.verifyCustomerAnswersDuringSessionFlow = async (req, res) => {
  const user = req.user
  const sessionid = req.params && req.params.id;
  if (!sessionid) {
    res.status(400).json({
      error: 'Session id not found'
    })
  }
  req = matchedData(req);

  const finalResponseData = {
    customerUser: null,
    identityDataResponse: null
  }
  const newSessionModelData = await NewSessionModel.findOne({
    _id: sessionid
  })
  let identityDataResponse = {
    firstName: null,
    lastName: null,
    fillAPIResponseDoc: null,
    cardAPIResponseDoc: null,
    consumerPlusAPIResponseDoc: null,
    typeOfPhotoId: null
  };
  if (newSessionModelData.userId) {
    const customerUser = await User.findOne({
      _id: newSessionModelData.userId
    })
    if (customerUser) {
      finalResponseData.customerUser = customerUser
    }
    identityDataResponse = await IdentityModel.findOne({
      userId: user._id,
      sessionid: String(sessionid)
    })
    if (identityDataResponse) {
      finalResponseData.identityDataResponse = identityDataResponse
    }
  }
  if (!identityDataResponse.firstName) {
    return res.status(400).json({
      error: 'Identities Data Not Found'
    })
  }
  const sessionUserLogsData = new SessionUserLogs({
    sessionid: new mongoose.Types.ObjectId(sessionid),
    userId: new mongoose.Types.ObjectId(newSessionModelData.userId),
    actionType: 'kba_answered',
    kbaAnswers: req.answers
  });
  sessionUserLogsData.save();
  const diff = new Date().valueOf() - newSessionModelData.kbaStartedAt.valueOf()
  const minutesDifference = diff / (60 * 1000)
  console.log('minutesDifference', minutesDifference)
  let kbaInTime = true;
  if (minutesDifference >= 2) {
    kbaInTime = false;
  }
  if (!kbaInTime) {
    return res.status(200).json({
      // status: response.every(value => value === 'true'),
      status: false,
      kbaTimeOver: true
    })
  }
  let questionDocs
  const questionBlockValue = req.questionBlock;

  const cardObj = identityDataResponse.cardAPIResponseDoc;
  let checkCardObject = true;
  if (identityDataResponse.typeOfPhotoId === 'passportbook') {
    checkCardObject = false;
  }
  console.log('checkCardObject', checkCardObject)
  if (cardObj && checkCardObject) {
    const localQuestionDocs = cardObj?.platformresponse?.response?.[0]?.questions?.[0]?.question;
    console.log('localQuestionDocs', localQuestionDocs)
    console.log(util.inspect(localQuestionDocs, {showHidden: false, depth: null, colors: true}));
    const finalQuestionDocs = []
    _.map(localQuestionDocs, (tempQuestionDoc) => {
      finalQuestionDocs.push({
        '@_text': tempQuestionDoc?.temp?.text,
        '@_type': tempQuestionDoc?.temp?.type,
        'Answer': _.map(tempQuestionDoc.answer, (tempAnswerDoc) => {
          return {
            'text': tempAnswerDoc._,
            '@_correct': tempAnswerDoc?.temp?.correct
          }
        })
      })
    })
    if (finalQuestionDocs.length < 10) {
      const newQuestionsNeeded = 10 - finalQuestionDocs.length;
      console.log('newQuestionsNeeded', newQuestionsNeeded)
      for (let i = 0; i < newQuestionsNeeded; i += 1) {
        finalQuestionDocs.push(finalQuestionDocs[i])
      }
    }
    questionDocs = finalQuestionDocs
    // finalOutput = {
    //   test: {
    //     Questions: {
    //       Question: finalQuestionDocs
    //     },
    //   },
    //   output: cardObj?.platformresponse?.response?.[0]?.workflowoutcome?.[0]?.["_"] || "Fail",
    //   details: {}
    // }
  } else if (identityDataResponse.fillAPIResponseDoc) {
    const jObj = identityDataResponse.fillAPIResponseDoc;
    const tempResponse = jObj.PlatformResponse && jObj.PlatformResponse.Response || {};
    // if (_.isObject(questionBlockValue) && questionBlockValue && questionBlockValue.value) {
    //   questionBlockValue = questionBlockValue.value
    // }
    if (tempResponse && tempResponse.Questions && tempResponse.Questions.Question &&
      tempResponse.Questions.Question.length < 10) {
      const newQuestionsNeeded = 10 - tempResponse.Questions.Question.length;
      console.log('newQuestionsNeeded', newQuestionsNeeded)
      for (let i = 0; i < newQuestionsNeeded; i += 1) {
        tempResponse.Questions.Question.push(tempResponse.Questions.Question[i])
      }
    }
    questionDocs = tempResponse.Questions.Question
  } else if (identityDataResponse.consumerPlusAPIResponseDoc) {
    const tempObj = identityDataResponse.consumerPlusAPIResponseDoc;
    const tempResponse = tempObj.PlatformResponse && tempObj.PlatformResponse.Response || {};
    // if (_.isObject(questionBlockValue) && questionBlockValue && questionBlockValue.value) {
    //   questionBlockValue = questionBlockValue.value
    // }
    if (tempResponse && tempResponse.Questions && tempResponse.Questions.Question &&
      tempResponse.Questions.Question.length < 10) {
      const newQuestionsNeeded = 10 - tempResponse.Questions.Question.length;
      console.log('newQuestionsNeeded', newQuestionsNeeded)
      for (let i = 0; i < newQuestionsNeeded; i += 1) {
        tempResponse.Questions.Question.push(tempResponse.Questions.Question[i])
      }
    }
    questionDocs = tempResponse.Questions.Question
  }
  let startIndex = 0;
  if (questionBlockValue === 'B') {
    startIndex = 5;
  }
  const response = [];
  for ( let i = 0; i < 5; i += 1) {
    const currentQuestion = questionDocs[i + startIndex];
    currentQuestion.Answer.forEach((answer) => {
      if (answer.text === req.answers[i]) {
        response[i] = answer['@_correct'];
        return;
      }
    });
  }
  const totalCorrectAnswersToPass = 4;
  const finalOutput = {
    // status: response.every(value => value === 'true'),
    status: response.filter((value) => value === 'true').length >= totalCorrectAnswersToPass,
    response,
    totalCorrectAnswersToPass,
    newSessionModelData
  }
  if (questionBlockValue === 'A' && finalOutput.status) {
    const sessionUserLogsData2 = new SessionUserLogs({
      sessionid: new mongoose.Types.ObjectId(sessionid),
      userId: new mongoose.Types.ObjectId(newSessionModelData.userId),
      actionType: 'kba_succeeded'
    });
    sessionUserLogsData2.save();
  } else if (questionBlockValue === 'A' && !finalOutput.status) {
    const sessionUserLogsData2 = new SessionUserLogs({
      sessionid: new mongoose.Types.ObjectId(sessionid),
      userId: new mongoose.Types.ObjectId(newSessionModelData.userId),
      actionType: 'kba_first_set_failed'
    });
    sessionUserLogsData2.save();
  } else if (questionBlockValue === 'B' && finalOutput.status) {
    const sessionUserLogsData2 = new SessionUserLogs({
      sessionid: new mongoose.Types.ObjectId(sessionid),
      userId: new mongoose.Types.ObjectId(newSessionModelData.userId),
      actionType: 'kba_succeeded'
    });
    sessionUserLogsData2.save();
  } else if (questionBlockValue === 'B' && !finalOutput.status) {
    const sessionUserLogsData2 = new SessionUserLogs({
      sessionid: new mongoose.Types.ObjectId(sessionid),
      userId: new mongoose.Types.ObjectId(newSessionModelData.userId),
      actionType: 'kba_failed'
    });
    sessionUserLogsData2.save();
  }
  res.status(200).json(finalOutput)
};

exports.savePDFEditingPage = async (req, res) => {
  let droppedElements = req.body && req.body.droppedElements || [];
  let droppedElementsDocIdWise = req.body && req.body.droppedElementsDocIdWise || {};
  const sessionid = req.params && req.params.id
  if (!sessionid) {
    res.status(400).json({
      error: 'Session id not found'
    })
  }
  console.log(req.body);
  const newSessionModelData = await NewSessionModel.findOne({
    _id: sessionid
  })
  newSessionModelData.attachCertificate = req.body.attachCertificate;
  newSessionModelData.notorizationType = req.body.notorizationType;
  newSessionModelData.costOfNotarization = req.body.costOfNotarization;
  newSessionModelData.finalCostOfNotarization = req.body.finalCostOfNotarization;
  newSessionModelData.emptyPagesAdded = req.body.emptyPagesAdded;
  newSessionModelData.sessionCustomCharges = req.body.sessionCustomCharges;
  if (req.body.emptyPagesAddedDocIdWise) {
    newSessionModelData.emptyPagesAddedDocIdWise = req.body.emptyPagesAddedDocIdWise;
  }
  await newSessionModelData.save()
  let pdfDroppedElementsDoc = await PDFDroppedElementsModel.findOne({ sessionid });
  if (!pdfDroppedElementsDoc) {
    pdfDroppedElementsDoc = new PDFDroppedElementsModel({ sessionid })
  }
  if (_.isString(droppedElements)) {
    droppedElements = JSON.parse(droppedElements);
  }
  pdfDroppedElementsDoc.droppedElements = droppedElements
  if (_.isString(droppedElementsDocIdWise)) {
    droppedElementsDocIdWise = JSON.parse(droppedElementsDocIdWise)
  }
  pdfDroppedElementsDoc.droppedElementsDocIdWise = droppedElementsDocIdWise
  await pdfDroppedElementsDoc.save()
  res.status(200).json({ success: true })
};

exports.pdfEditsFinalDocumentSave = async (req, res) => {
  const file = req.file
  const user = req.user
  const filename = req.body.filename
  const lastDocument = req.body.lastDocument || false
  console.log('lastDocument', lastDocument)
  const originalDocumentId = req.body.originalDocumentId
  const sessionid = req.params && req.params.id
  req = matchedData(req);
  const sessions = await NewSessionModel.findOne({ _id: sessionid });
  try {
    if (file) {

      // Create Document First
      const tempDocumentDoc = {
        sessionid,
        documentCategory: 'final_document',
        name: filename,
        url: file.location,
        type: file.mimetype,
        size: file.size,
        key: file.key,
        bucketName: file.bucket,
        uploadedBy: user.id,
        uploadedStage: 'meet_notary_stage',
        originalDocumentId: null
      }
      if (originalDocumentId) {
        tempDocumentDoc.originalDocumentId = originalDocumentId
      }
      const uploadedDocument = new DocumentModel(tempDocumentDoc);
      const uploadedDocumentDoc = await uploadedDocument.save();

      sessions.finalDocumentId = uploadedDocumentDoc._id;
      sessions.status = 'complete';
      sessions.stagesHistory.push({
        stageName: 'Session Complete',
        stageDate: new Date()
      });
      await sessions.save();
      const notaries = await IdentityModel.findOne({ sessionid });
      console.log('notaries', notaries)

      // Sign DC
      // get P12 file
      const notaryDatasDoc = await NotaryDataModel.findOne({
        userId: sessions.notaryUserId
      })
      // get the Notary
      const notaryUser = await User.findOne({
        _id: sessions.notaryUserId
      })
      // Sign with the existing p12
      const notaryData = {
        notaryUserId: notaryUser.id,
        contactInfo: notaryUser.email,
        name: notaryUser.name,
        location: (notaryDatasDoc && notaryDatasDoc.county) || 'US',
        dcPassword: (notaryDatasDoc && notaryDatasDoc.dcpassword) || 'bnDCpwd21'
      }
      console.log('notaryDatasDoc', notaryDatasDoc)
      // Sign with the existing p12
      if (notaryDatasDoc && notaryDatasDoc.certfileUrl) {
        await signDocument(uploadedDocumentDoc.key,
            notaryDatasDoc.fileKey,
            sessionid,
            'Signed Certificate By Blue Notary.',
            notaryData);
      } else { // generate new p12
        const p12 = require('node-openssl-p12').createClientSSL;
        const clientFileName = `client_${sessionid}`
        const p12options = {
          clientFileName,
          bitSize: 2048,
          C: 'US', // Country Name (2 letter code)
          ST: notaryUser.state || 'Illinois', // State or Province Name (full name)
          L: notaryUser.state || 'Chicago', // Locality Name (eg, city)
          O: 'Blue Notary LLC', // Organization Name (eg, company)
          OU: notaryUser.state || 'Illinois', // Organizational Unit Name (eg, section)
          CN: notaryUser.name, // Common Name (eg, fully qualified host name)
          emailAddress: notaryUser.email, // Notary Email
          clientPass: (notaryDatasDoc && notaryDatasDoc.dcpassword) || 'bnDCpwd21', // DC password
          caFileName: 'ca',
          serial: '01',
          days: 365
        };
        const p12FilePath = path.join( process.cwd(), 'ssl', `${clientFileName}.p12`)
        if (fs.existsSync(p12FilePath)) {
          fs.unlinkSync(p12FilePath)
        }

        // generate p12 for notary
        await p12(p12options).done((options, sha1fingerprint) => {
          console.log('SHA-1 fingerprint:', sha1fingerprint);
          console.log('options:', options);
        }).fail((err) => {
          console.log('error', err);
        });

        if (fs.existsSync(p12FilePath)) {
          const p12File = await upload(process.env.AWSBucket,
              `${clientFileName}.p12`,
              fs.readFileSync(p12FilePath),
              'application/x-pkcs12'
          )

          // save p12 to notary
          notaryDatasDoc.certfileUrl = p12File.Location;
          notaryDatasDoc.certfilename = clientFileName;
          notaryDatasDoc.certfileSource = 'automatic';
          notaryDatasDoc.certfileAddedAt = new Date();
          notaryDatasDoc.fileKey = clientFileName;
          await notaryDatasDoc.save();

          await signDocument(uploadedDocumentDoc.key,
              notaryDatasDoc.fileKey,
              sessionid,
              'Signed Certificate By Blue Notary.',
              notaryData);

          // remove p12 in ssl
          fs.unlinkSync(p12FilePath)
        } else {
          console.log('error: it could not generate p12')
        }
      }
      let paymentDone = ''
      if (lastDocument === 'true') {
        AlertingService.endSessionAlertingService(sessionid, user.id, false)
        paymentDone = await processChargesForSession(sessions, notaries, user);
      }
      res.status(200).json({
        success: true,
        paymentDone
      });
    } else {
      res.status(400).json({ error: true });
    }
  } catch (err) {
    const error = err as any;
    console.log('error', error)
    if (error.code) {
      let errorMessage = 'Your card was declined. Reason: ' + error.code
      if (error.decline_code) {
        errorMessage += ' (' + error.decline_code + ')'
      }
      sessions.failMessage = errorMessage
      sessions.paid = false
      sessions.save()
      res.status(200).json({
        success: true,
        paymentDone: 'failure'
      });
    } else {
      utils.handleError(res, error);
    }
  }
};

exports.pdfEditsVideoDocumentSave = async (req, res) => {
  const sessionid = req.params && req.params.id
  const sessions = await NewSessionModel.findOne({ _id: sessionid });
  try {
    req = matchedData(req);
    const filepathStarting = videoSavingDir + '/SESSION_VIDEO_' + sessionid + '*'
    sessions.videoSavingProcessingStage = 'processing'
    await sessions.save();
    glob(filepathStarting, {}, async (err, files) => {
      console.log(files)
      if (!files.length) {
        sessions.videoSavingProcessingStage = 'failed'
        sessions.videoSavingProcessingError = 'No video files Found. Invalid Session'
        await sessions.save();
        return res.status(400).json({
          errors: {
            msg: 'No video files Found. Invalid Session'
          }
        })
      }
      saveTheIndividualFailedStreams(sessions, files)
      res.status(200).json({ success: true });
    })
  } catch (error) {
    sessions.videoSavingProcessingStage = 'failed'
    sessions.videoSavingProcessingError = String(error)
    await sessions.save();
    utils.handleError(res, error);
  }
};

exports.pdfEditsVideoDocumentSaveSecondaryServer = async () => {
  const sessionsForVideoProcessing = await NewSessionModel.find({
    videoSavingProcessingStage: 'processing'
  });
  console.log('sessionsForVideoProcessing.length', sessionsForVideoProcessing.length)
  await Promise.all(_.map(sessionsForVideoProcessing, async (sessionDoc) => {
    const sessionid = sessionDoc._id
    const currentSessionDoc = await NewSessionModel.findOne({
      _id: sessionid,
      videoSavingProcessingStage: 'processing'
    })
    console.log('currentSessionDoc found', !_.isEmpty(currentSessionDoc))
    if (!currentSessionDoc) {
      return
    }
    console.log('sessionid', sessionid)
    const allTempVideoRecordingFiles = await DocumentModel.find({
      sessionid,
      documentCategory : 'temp_video_recording_file'
    })
    console.log('allTempVideoRecordingFiles.length', allTempVideoRecordingFiles.length)
    if (!allTempVideoRecordingFiles.length) {
      return
    }
    sessionDoc.videoSavingProcessingStage = 'processing_started'
    console.log('started')
    await sessionDoc.save();
    await Promise.all(_.map(allTempVideoRecordingFiles, async (tempVideoRecordingFile) => {
      const videoObject = await getObject(process.env.AWSBucket, tempVideoRecordingFile.key);
      const videoObjectBody = videoObject.Body as string
      const inputFile = './videotmp/' + tempVideoRecordingFile.name
      await fs.writeFileSync(inputFile, videoObjectBody)
    }))
    console.log('files downloaded')
    try {
      const filepathStarting = './videotmp/SESSION_VIDEO_' + sessionid + '*'
      const filepath = './videotmp/SESSION_VIDEO_OUTPUT_' + sessionid + '.mp4'
      glob(filepathStarting, {}, async (err, files) => {
        console.log(files)
        if (!files.length) {
          sessionDoc.videoSavingProcessingStage = 'failed'
          sessionDoc.videoSavingProcessingError = 'No video files Found. Invalid Session'
          await sessionDoc.save();
          return
        }
        try {
          const complexFilter = ['', '']
          for (let fileNumber = 0; fileNumber < files.length; fileNumber += 1) {
            complexFilter[0] += '[v' + String(fileNumber) + ']'
            complexFilter[1] += '[' + String(fileNumber) + ':a]'
          }
          complexFilter[0] += 'hstack=inputs=' + String(files.length) + '[v]'
          complexFilter[1] += 'amix=inputs=' + String(files.length) + '[a]'
          for (let fileNumber = files.length - 1; fileNumber >= 0; fileNumber -= 1) {
            console.log('fileNumber', fileNumber)
            complexFilter.unshift('[' + fileNumber + ':v]scale=1024:576:force_original_aspect_ratio=1[v' + fileNumber + ']')
          }
          // const complexFilter = [
          //   "[0:v][1:v][2:v]hstack=inputs=3[v]",
          //   "[0:a][1:a][2:a]amix=inputs=3[a]"
          // ]
          // const complexFilter = [
          //   '[0:v]scale=1024:576:force_original_aspect_ratio=1[v0]',
          //   '[1:v]scale=1024:576:force_original_aspect_ratio=1[v1]',
          //   '[v0][v1]hstack=inputs=2[v]',
          //   '[0:a][1:a]amix=inputs=2[a]'
          // ]
          console.log(complexFilter)
          files
          .reduce((prev, curr) => prev.input(curr), ffmpeg())
          .complexFilter(complexFilter)
          .outputOptions([
            '-map [v]',
            '-map [a]'
          ])
          .output(filepath)
          .on('error', (er) => {
            console.log(`An eror occurred while merging video files: ${er.message}`);
            sessionDoc.videoSavingProcessingStage = 'failed'
            sessionDoc.videoSavingProcessingError = String(er.message)
            sessionDoc.save();
            return
          })
          .on('end', async () => {
            const fileContent = fs.readFileSync(filepath);
            const fileSize = fs.statSync(filepath)
            const file = await upload(process.env.AWSBucket, 'SESSION_VIDEO_OUTPUT_' + sessionid + '.mp4',
            fileContent, 'video/mp4')
            console.log(file)
            if (file) {
              // Create Document First
              const url = s3.getSignedUrl('getObject', {
                  Bucket: process.env.AWSBucket,
                  Key: file.Key,
                  Expires: 60 * 60 * 24 * 6
              });
              console.log(url)
              const uploadedDocument = new DocumentModel({
                sessionid,
                documentCategory: 'video_recording_file',
                name: 'SESSION_VIDEO_OUTPUT_' + sessionid + '.mp4',
                url,
                type: 'video/mp4',
                size: fileSize.size,
                key: file.Key,
                bucketName: file.Bucket,
                uploadedStage: 'meet_notary_stage'
              });
              const uploadedDocumentDoc = await uploadedDocument.save();

              sessionDoc.videoFileDocumentId = uploadedDocumentDoc._id;
              sessionDoc.videoSavingProcessingStage = 'completed'
              await sessionDoc.save();
              return
            } else {
              sessionDoc.videoSavingProcessingStage = 'failed'
              sessionDoc.videoSavingProcessingError = 'Video Upload failed'
              await sessionDoc.save();
              return
            }
            fs.unlinkSync(filepath);
            _.map(files, (tempfile) => {
              try {
                fs.unlinkSync(tempfile);
              } catch (error) {
                console.log(error)
              }
            })
          }).run()
        } catch (error) {
          console.log('error1', error)
          sessionDoc.videoSavingProcessingStage = 'failed'
          sessionDoc.videoSavingProcessingError = String(error)
          await sessionDoc.save();
          return
        }
      })
    } catch (error) {
      sessionDoc.videoSavingProcessingStage = 'failed'
      sessionDoc.videoSavingProcessingError = String(error)
      await sessionDoc.save();
    }
  }))
};

exports.addWitnessDuringSession = async (req, res) => {
  try {
    const user = req.user
    req = matchedData(req);
    const sessionid = req.sessionid
    const witnessDetails = req.witnessDetails
    const sessions = await NewSessionModel.findOne({ _id: sessionid });

    let witnessDoc;
    let witnessUser;
    const password = utils.generateRandomPassword(6);
    if (witnessDetails.id) {
      witnessDoc = await WitnessModel.findOne({_id: witnessDetails.id})
      // const password = utils.generateRandomPassword(6);
      if (!witnessDoc) {
        return res.status(400).json({
          errors: {
            msg: 'Witness Doc not found'
          }
        })
      }
      const existingUserDoc = await User.findOne({email: sessionid + '_' + witnessDoc.email})
      if (existingUserDoc) {
        return res.status(400).json({
          errors: {
            msg: 'This Witness already added to the session'
          }
        })
      }
      witnessUser = new User({
        name: witnessDoc.firstName + ' ' + witnessDoc.lastName,
        first_name: witnessDoc.firstName,
        last_name: witnessDoc.lastName,
        email: sessionid + '_' + witnessDoc.email,
        realEmail: witnessDoc.email,
        password,
        verification: uuid.v4(),
        role: 'witness',
        state: '',
        verified: true,
        temporary: true,
        witnessid: witnessDoc._id
      });
      await witnessUser.save();
    } else if (witnessDetails.witnessSelectionType === 'bn_witness_open_call') {
      sessions.sessionOpenCallForWitness = true
      sessions.sessionOpenCallForWitnessAt = new Date()
      await sessions.save()
    } else {
      console.log(sessionid + '_' + witnessDetails.email)
      const existingUserDoc = await User.findOne({email: sessionid + '_' + witnessDetails.email})
      if (existingUserDoc) {
        return res.status(400).json({
          errors: {
            msg: 'This Witness already added to the session'
          }
        })
      }
      witnessDoc = new WitnessModel({
        userid: user.id,
        usertype: user.role,
        firstName: witnessDetails.firstName,
        lastName: witnessDetails.lastName,
        email: witnessDetails.email,
        phoneNumber: witnessDetails.phoneNumber
      })
      await witnessDoc.save()
      // password = utils.generateRandomPassword(6);
      // console.log('password ', password);
      // console.log('email ', email);
      // create new customer with email and generated password
      witnessUser = new User({
        name: witnessDetails.firstName + ' ' + witnessDetails.lastName,
        first_name: witnessDetails.firstName,
        last_name: witnessDetails.lastName,
        email: sessionid + '_' + witnessDetails.email,
        realEmail: witnessDetails.email,
        password,
        verification: uuid.v4(),
        role: 'witness',
        state: '',
        verified: true,
        temporary: true,
        witnessid: witnessDoc._id
      });
      await witnessUser.save();
    }
    if (witnessDetails.witnessSelectionType !== 'bn_witness_open_call') {
      const sessionWitnessQuery = {
        sessionid,
        witnessid: witnessDoc._id
      }
      let originalSessionWitnessDoc = await SessionWitness.findOne(sessionWitnessQuery)
      if (!originalSessionWitnessDoc) {
        originalSessionWitnessDoc = new SessionWitness({
          sessionid,
          witnessid: witnessDoc._id
        })
        await originalSessionWitnessDoc.save()
      }
      emailer.sendEmailToWitnessWhenInvitedToSession(witnessUser, password, sessions.meetingdatetimeobj, sessionid);
    }
    let allSessionWitnessDocs = await SessionWitness.find({
      sessionid,
      deleted: {$ne: true}
    })
    const allWitnessIds = _.map(allSessionWitnessDocs, 'witnessid')
    const allWitnessDocs = await WitnessModel.find({
      _id: {$in: allWitnessIds},
      deleted: {$ne: true}
    })
    const witnessDocsKeyed = _.keyBy(allWitnessDocs, '_id')
    allSessionWitnessDocs = _.map(allSessionWitnessDocs, (localSessionWitnessDoc) => {
      localSessionWitnessDoc = JSON.parse(JSON.stringify(localSessionWitnessDoc))
      localSessionWitnessDoc.witnessDoc = witnessDocsKeyed[String(localSessionWitnessDoc.witnessid)]
      return localSessionWitnessDoc
    })
    res.status(200).json({
      success: true,
      allSessionWitnessDocs
    })
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.getAllWitnessDetails = async (req, res) => {
  try {
    const user = req.user

    const allWitnessDocs = await WitnessModel.find({
      userid: user.id,
      deleted: {$ne: true}
    })
    res.status(200).json({
      allWitnessDocs
    })
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.joinSessionAsWitness = async (req, res) => {
  try {
    const user = req.user
    req = matchedData(req);
    console.log('req', req)
    const sessionid = req.sessionid
    console.log('sessionid', sessionid)
    const sessions = await NewSessionModel.findOne({ _id: sessionid });
    console.log('sessions', sessions)
    // Use below variable for future witnesses
    const joinedAsBNWitness = true;

    if (joinedAsBNWitness) {

      // const sessionWitnessQuery = {
      //   sessionid,
      //   userid: user._id
      // }
      let sessionWitnessQuery;
      if (user.role === 'witness' && user.witnessid) {
        sessionWitnessQuery = {
          $or: [
            {
              sessionid,
              userid: user._id
            },
            {
              sessionid,
              witnessid: user.witnessid
            }
          ]
        }
      } else {
        sessionWitnessQuery = {
          $or: [
            {
              sessionid,
              userid: user._id
            }
          ]
        }
      }
      const userAlreadyWitnessInCurrentSession = await SessionWitness.findOne(sessionWitnessQuery)
      if (!userAlreadyWitnessInCurrentSession && !sessions.sessionOpenCallForWitness) {
        return res.status(400).json({
          failure: true,
          errors: {
            msg: 'Session already joined by witness'
          }
        })
      }

      if (!userAlreadyWitnessInCurrentSession) {
        const newSessionWitnessDoc = new SessionWitness({
          sessionid,
          userid: user._id
        })
        await newSessionWitnessDoc.save()
      }

      // Uncomment below when ready
      sessions.sessionOpenCallForWitness = null
      sessions.sessionOpenCallForWitnessAt = null
      await sessions.save()
    }
    return res.status(200).json({
      success: true
    })
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.getAllSessionWitnesses = async (req, res) => {
  try {
    const sessionid = req.params && req.params.id
    let userAlreadyWitnessInCurrentSession = await SessionWitness.find({sessionid})
    const witnessUserDocs = await User.find({witnessid: {$in: _.map(userAlreadyWitnessInCurrentSession, 'witnessid')}})
    const witnessDocs = await WitnessModel.find({_id: _.map(userAlreadyWitnessInCurrentSession, 'witnessid')})
    const userDocs = await User.find({_id: _.map(userAlreadyWitnessInCurrentSession, 'userid')})
    const witnessUserDocsMap = {}
    _.map(witnessUserDocs, (witnessUserDoc) => {
      witnessUserDocsMap[witnessUserDoc.witnessid] = witnessUserDoc._id
    })
    const witnessDocMap = {}
    _.map(witnessDocs, (witnessDoc) => {
      witnessDocMap[witnessDoc._id] = witnessDoc
    })
    const userDocMap = {}
    _.map(userDocs, (userDoc) => {
      userDocMap[userDoc._id] = userDoc
    })
    userAlreadyWitnessInCurrentSession = JSON.parse(JSON.stringify(userAlreadyWitnessInCurrentSession))
    userAlreadyWitnessInCurrentSession = _.map(userAlreadyWitnessInCurrentSession, (sessionWitnessDoc) => {
      if (sessionWitnessDoc.witnessid && witnessUserDocsMap[sessionWitnessDoc.witnessid]) {
        sessionWitnessDoc.userid = witnessUserDocsMap[sessionWitnessDoc.witnessid]
      }
      if (sessionWitnessDoc.witnessid && witnessDocMap[String(sessionWitnessDoc.witnessid)]) {
        sessionWitnessDoc.witnessdoc = witnessDocMap[String(sessionWitnessDoc.witnessid)]
      }
      if (sessionWitnessDoc.userid && userDocMap[String(sessionWitnessDoc.userid)]) {
        sessionWitnessDoc.userdoc = userDocMap[String(sessionWitnessDoc.userid)]
      }
      return sessionWitnessDoc
    })
    return res.status(200).json({
      sessionWitnesses: userAlreadyWitnessInCurrentSession
    })
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.removeSessionWitness = async (req, res) => {
  try {
    // const user = req.user
    req = matchedData(req);
    const sessionid = req.sessionid
    const sessionwitnessid = req.sessionwitnessid
    console.log(sessionid, sessionwitnessid)
    const sessionWitnessDoc = await SessionWitness.findOne({
      _id: sessionwitnessid,
      sessionid
    })
    if (!sessionWitnessDoc) {
      return res.status(400).json({
        errors: {
          msg: 'Witness Not Found'
        }
      })
    }
    await SessionWitness.remove({
      _id: sessionwitnessid,
      sessionid
    })
    console.log('sessionWitnessDoc', sessionWitnessDoc)
    return res.status(200).json({
      success: true
    })
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.saveDraftOfCurrentSession = async (req, res) => {
  try {
    // const user = req.user
    req = matchedData(req);
    const sessionid = req.sessionid
    const droppedElementsDocIdWise = req.droppedElementsDocIdWise
    const finalValueToSave = {}
    _.map(droppedElementsDocIdWise, (droppedElements, documentId) => {
      finalValueToSave[documentId] = _.compact(_.uniqBy(droppedElements, 'elementId'))
      console.log(documentId, finalValueToSave[documentId])
    })
    // console.log(sessionid, sessionwitnessid)
    let draftsDoc = await SessionDraftsModel.findOne({
      sessionid
    })
    if (!draftsDoc) {
      draftsDoc = new SessionDraftsModel({
        sessionid,
        droppedElementsDocIdWise: finalValueToSave
      })
    } else {
      draftsDoc.droppedElementsDocIdWise = finalValueToSave
    }
    await draftsDoc.save()
    return res.status(200).json({
      success: true
    })
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.doOpenCallForActiveSession = async (req, res) => {
  try {
    const user = req.user
    req = matchedData(req);
    const sessionid = req.sessionid
    const sessions = await NewSessionModel.findOne({ _id: sessionid });
    console.log('sessions', sessions)
    if (!sessions.sessionOpenCallForTaking) {
      delete sessions.notaryUserId
      sessions.sessionOpenCallForTaking = true
      sessions.sessionOpenCallForTakingAt = new Date();
      await sessions.save()
      const shortSessionID = (sessionid).toString().substr((sessionid).toString().length - 5).toUpperCase();
      const identityModelData = await IdentityModel.findOne({
        sessionid: req.params.id
      })
      if (!user.testingacc) {
        await emailer.sendEmailToAllNotaries(shortSessionID, sessions, identityModelData);
      }
    }
    return res.status(200).json({
      success: true
    })
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.createCustomer = async (req, res) => {
  try {
    const user = req.user
    console.log('user:', user)
    req = matchedData(req);
    console.log('req:', req)

    const notaries = await IdentityModel.findOne({ sessionid: req.sessionId, userId: user._id })
    if (!notaries) {
      return res.status(200).json({ message: 'No session available, please check and try again.' });
    }
    let customer;
    let stripeToUse;
    if (user.testingacc) {
      stripeToUse = stripeTest
    } else {
      stripeToUse = stripe
    }
    customer = await stripeToUse.customers.create({
      email: notaries.email,
      source: req.data.id
    });
    notaries.stripeCustomerID = customer.id;
    notaries.stripeBrand = req.data.card.brand;
    notaries.last4 = req.data.card.last4;
    notaries.exp_month = req.data.card.exp_month;
    notaries.exp_year = req.data.card.exp_year;
    await notaries.save();

  // update session stage
    const session = await NewSessionModel.findOne({_id: req.sessionId});
    console.log(session)
    if (session.currentStage === 'payment_info_stage') {
      if (session.notorizationTiming === 'notarize_later' && !session.notaryUserId) {
        session.status = 'ready to pick'; // Ready to Notary to be picked
      } else {
        session.status = 'ready to sign'; // Ready to meet Notary
      }
      session.currentStage = 'meet_notary_stage';
      session.stagesHistory.push({
        stageName: 'Meet Notary stage',
        stageDate: new Date()
      });
      session.save();
    }

  // update document stage
    const document = await DocumentModel.findOne({sessionid: session._id});
    if (document.uploadedStage === 'payment_info_stage') {
    document.uploadedStage = 'meet_notary_stage';
    document.save();
  }

    res.status(200).json(notaries);
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.createCustomerForInviteSigner = async (req, res) => {
  try {
    const user = req.user
    console.log('user:', user)
    req = matchedData(req);
    console.log('req:', req)

    let customer;
    let stripeToUse;
    if (user.testingacc) {
      stripeToUse = stripeTest
    } else {
      stripeToUse = stripe
    }
    customer = await stripeToUse.customers.create({
      email: user.email,
      source: req.data.id
    });
    const responseForIdentities = {
      stripeCustomerID: customer.id,
      stripeBrand: req.data.card.brand,
      last4: req.data.card.last4,
      exp_month: req.data.card.exp_month,
      exp_year: req.data.card.exp_year
    }

    res.status(200).json(responseForIdentities);
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.stripeSessionStatus = async (req, res) => {
  try {
    const user = req.user;
    const notarydm = await NotaryDataModel.findOne({ userId: user._id });
    if (notarydm.upgradeStripeSessionId) {
      let stripeToUse;
      if (user.testingacc) {
        stripeToUse = stripeTest
      } else {
        stripeToUse = stripe
      }
      const session = await stripeToUse.checkout.sessions.retrieve(notarydm.upgradeStripeSessionId);
      if (session.payment_status === 'paid') {
        const userModel = await User.findOne({email: user.email});
        userModel.memberType = 'pro';
        userModel.save();
        notarydm.subscriptionExpiresOn = session.expires_at;
        notarydm.save();
      }
      res.status(200).json(session);
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.saveNotaryCustomCharges = async (req, res) => {
  try {
    const user = req.user;
    const userModel = await User.findOne({email: user.email});
    console.log(req.body)
    if (req.body && req.body.notaryCustomCharges) {
      userModel.notaryCustomCharges = req.body.notaryCustomCharges
      userModel.save();
    }
    res.status(200).json({
      success: true
    });
  } catch (error) {
    console.log('error', error)
    utils.handleError(res, error);
  }
};
exports.stripeCheckoutSession = async (req, res) => {
  try {
    const user = req.user;
    const notarydm = await NotaryDataModel.findOne({ userId: user._id })
    let stripeToUse;
    if (user.testingacc) {
      stripeToUse = stripeTest
    } else {
      stripeToUse = stripe
    }
    let priceID
    if (user.testingacc) {
      priceID = process.env.TEST_NOTARY_SUBSCRIPTION_PRICE_ID
    } else {
      priceID = process.env.NOTARY_SUBSCRIPTION_PRICE_ID
    }

    const session = await stripeToUse.checkout.sessions.create({
      line_items: [{
        price: priceID,
        quantity: 1
      }],
      customer_email: user.email,
      mode: 'subscription',
      success_url: process.env.FRONT_URL + '/notary/upgrade/success',
      cancel_url: process.env.FRONT_URL + '/notary'
    });
    notarydm.upgradeStripeSessionId = session.id;
    notarydm.save();
    res.status(200).json(session);
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.repaymentForSession = async (req, res) => {
  const user = req.user
  console.log('user:', user)
  req = matchedData(req);
  console.log('req:', req)
  const sessions = await NewSessionModel.findOne({ _id: req.sessionId });
  try {
    console.log({
      sessionid: String(req.sessionId), userId: user._id
    })
    const notaries = await IdentityModel.findOne({ sessionid: String(req.sessionId), userId: user._id })
    if (!notaries) {
      return res.status(200).json({ message: 'No session available, please check and try again.' });
    }
    let customer;
    let stripeToUse;
    if (user.testingacc) {
      stripeToUse = stripeTest
    } else {
      stripeToUse = stripe
    }
    customer = await stripeToUse.customers.create({
      email: notaries.email,
      source: req.data.id
    });
    notaries.stripeCustomerID = customer.id;
    notaries.stripeBrand = req.data.card.brand;
    notaries.last4 = req.data.card.last4;
    notaries.exp_month = req.data.card.exp_month;
    notaries.exp_year = req.data.card.exp_year;
    await notaries.save();
    const paymentDone = await processChargesForSession(sessions, notaries, user)
    console.log(paymentDone)
    if (paymentDone) {
      sessions.paid = true
      await sessions.save()
    }
    res.status(200).json({
      paymentDone
    });
  } catch (err) {
    const error = err as any;
    let errorMessage = 'Your card was declined. Reason: ' + error.code
    if (error.decline_code) {
      errorMessage += ' (' + error.decline_code + ')'
    }
    sessions.failMessage = errorMessage
    sessions.save()
    res.status(402).json({
      errors: {
        msg: errorMessage
      }
    });
    // utils.handleError(res, error);
  }
};

exports.saveSignatures = async (req, res) => {
  const user = req.user
  req = matchedData(req);
  const signaturedata = req.signaturedata;
  const newSignature = new SignaturesDataModel({
    signaturedata,
    user: user._id
  })
  await newSignature.save()
  res.status(200).json({ message: 'Your signature saved successfully.' });
}

exports.getSignatures = async (req, res) => {
  const user = req.user
  req = matchedData(req);
  const signatures = await SignaturesDataModel.find({
    user: user._id,
    deleted: {$ne: true}
  }).sort({createdAt: -1})
  res.status(200).json({ signatures });
}

exports.deleteSignature = async (req, res) => {
  const user = req.user
  req = matchedData(req);
  const signatureId = req.signatureId
  console.log(user)
  console.log(signatureId)
  const signatureDoc = await SignaturesDataModel.findOne({
    _id: signatureId,
    user: user._id,
    deleted: {$ne: true}
  })
  if (!signatureDoc) {
    return res.status(200).json({
      errors: {
        msg: 'Signature Doc Not Found'
      }
    });
  }
  signatureDoc.deleted = true
  signatureDoc.deletedAt = new Date()
  await signatureDoc.save();
  res.status(200).json({
    success: true
  });
}

exports.saveSignatureImageFile = async (req, res) => {
  const user = req.user;
  const file = req.file;
  console.log('file', file)
  req = matchedData(req);
  const fileLocation = file.location;
  const backPhotoIdUrl = fileLocation.replace(/^https:\/\//i, 'http://');
  http.get(backPhotoIdUrl, (resp) => {
    resp.setEncoding('base64');
    let fileData = 'data:image/png;base64,';
    resp.on('data', (data) => {
      fileData += data;
    });
    resp.on('end', async () => {
      const newSignature = new SignaturesDataModel({
        signaureFileName: file.originalname,
        signaureFileUrl: file.location,
        signaureFileType: file.mimetype,
        signaureFileSize: file.size,
        signaureFileKey: file.key,
        signaureFileBucket: file.bucket,
        signaturedata: fileData,
        user: user._id
      })
      await newSignature.save()
      res.status(200).json({ message: 'Signature uploaded successfully.', file: file.location,
        signatureDoc: newSignature });
    });
  }).on('error', (e) => {
    res.status(400).json({
      error: e.message
    })
  });
},

// Notary - invite signer
exports.notaryInviteSigner = async (req, res) => {
  try {
    const files = req.files;
    console.log('uploadFile 2:', files)
    // console.log('uploadFile 2:', req.files)
    // console.log('uploadFile 2:', req.file)
    const user = req.user
    req = matchedData(req);
    const email = req.email;
    const name = req.name;
    const notaryId = req.notary_user_id;
    const meetingDate = req.meetingdate;
    const meetingTimeZone = req.meetingTimeZone;
    const currentTimeZone = req.currentTimeZone;
    const sessionType = req.sessionType;
    const templateId = req.template;
    const invitedByCustomer = req.invitedByCustomer;
    const selectedNotary = req.selectedNotary;
    const sessionChargeOnBusinessUser = req.sessionChargeOnBusinessUser || false;
    let sessionCreatedByBusinessUser = false;
    if (user.role === 'customer') {
      sessionCreatedByBusinessUser = true
    }
    let skipCustomerKBACheck = req.skipCustomerKBACheck || false;
    const stripeIdentityDetails = req.stripeIdentityDetails;
    let multiSignerList = req.multiSignerList;
    if (multiSignerList) {
      try {
        multiSignerList = JSON.parse(multiSignerList)
      } catch (error) {
        console.log(error)
      }
    }
    console.log('name:', name);
    console.log('email:', email);
    console.log('notaryId:', notaryId);
    console.log('meetingDate:', meetingDate);
    console.log('meetingTimeZone:', meetingTimeZone);
    console.log('template:', templateId);
    console.log('multiSignerList:', multiSignerList);
    console.log('sessionType:', sessionType);
    console.log('sessionChargeOnBusinessUser:', sessionChargeOnBusinessUser);
    console.log('skipCustomerKBACheck:', skipCustomerKBACheck);
    console.log('stripeIdentityDetails:', stripeIdentityDetails);
    console.log('sessionCreatedByBusinessUser:', sessionCreatedByBusinessUser);
    if (skipCustomerKBACheck && skipCustomerKBACheck !== 'false') {
      skipCustomerKBACheck = true;
    }
    // check if email exists
    let customer = await User.findOne({email});
    const notaryuser = await User.findOne({ _id: notaryId });
    let password = '';
    let dontSendTempPassword = true;
    if (!customer) {
      // generate random password
      password = utils.generateRandomPassword(6);
      dontSendTempPassword = false;
      console.log('password ', password);
      console.log('email ', email);
      // create new customer with email and generated password
      customer = new User({
        name,
        email,
        password,
        verification: uuid.v4(),
        role: 'customer',
        commissionNumber: '',
        state: '',
        verified: true,
        testingacc: user.testingacc || false
      });
      await customer.save();
    } else {
      if (customer.name === '') {
        customer.name = name;
        await customer.save();
      }
      password = customer.password
    }
    let meetingDateTimeObj;
    meetingDateTimeObj = moment(meetingDate, 'YYYY-MM-DD hh:mm A');
    if (meetingTimeZone) {
      let currentTimeZoneOffset = parseFloat(String((new Date()).getTimezoneOffset() / 60))
      if (currentTimeZone) {
        currentTimeZoneOffset = parseFloat(String(currentTimeZone))
      }
      const currentMeetingTimeZone = parseFloat(meetingTimeZone)
      const finalOffset = (currentMeetingTimeZone - currentTimeZoneOffset) * 60
      console.log('finalOffset', finalOffset, currentMeetingTimeZone, currentTimeZoneOffset, moment.utc(meetingDate, 'YYYY-MM-DD hh:mm A'))
      meetingDateTimeObj = moment(meetingDate, 'YYYY-MM-DD hh:mm A').utcOffset(finalOffset, true)
      // meetingDateTimeObj = moment.utc(meetingDate, 'YYYY-MM-DD hh:mm A').utcOffset(currentMeetingTimeZone, true)
    } else {
      meetingDateTimeObj = moment(meetingDate, 'YYYY-MM-DD hh:mm A')
    }
    const sessionDoc = {
      sessionid: uuidV4(),
      userId: customer._id,
      notaryUserId: notaryId,
      currentStage: 'initial_stage',
      // sessionCode: (Math.random() + 1).toString(36).substring(7).toUpperCase(),
      status: 'unsigned',
      // finalDocumentId: '',
      // finalDocumentWithPdf: "",
      // x509Certificate: '',sending i just creage,
      meetingdate: meetingDate,
      meetingdatetimeobj: meetingDateTimeObj,
      meetingTimeZone,
      stagesHistory: [{
          stageName: 'Notary Invite Signer Session Created',
          stageDate: new Date()
      }],
      multiSignerList: null,
      sessionType,
      invitedByCustomer: null,
      selectedNotary: null,
      sessionChargeOnBusinessUser,
      sessionCreatedByBusinessUser,
      skipCustomerKBACheck,
      testingAccSession: user.testingacc ? true : false
    }
    if (multiSignerList && _.isArray(multiSignerList) && multiSignerList.length) {
      sessionDoc.multiSignerList = multiSignerList
    }
    if (invitedByCustomer) {
      sessionDoc.invitedByCustomer = user._id
    }
    if (selectedNotary) {
      sessionDoc.notaryUserId = selectedNotary
    } else if (user.role === 'customer') {
      sessionDoc.notaryUserId = null
    }
    // create new session
    const session =  new NewSessionModel(sessionDoc);
    await session.save();
    const sessionUserLogsData2 = new SessionUserLogs({
      sessionid: new mongoose.Types.ObjectId(session._id),
      userId: new mongoose.Types.ObjectId(notaryId),
      actionType: 'notary_invited'
    });
    sessionUserLogsData2.save();
    if (skipCustomerKBACheck) {
      const sessionUserLogsData3 = new SessionUserLogs({
        sessionid: new mongoose.Types.ObjectId(session._id),
        userId: new mongoose.Types.ObjectId(notaryId),
        actionType: 'skip_kba_consent_for_customer'
      });
      sessionUserLogsData3.save();
    }
    if (sessionChargeOnBusinessUser) {
      console.log('stripeIdentityDetails', stripeIdentityDetails, JSON.parse(stripeIdentityDetails))
      const stripeDetails = JSON.parse(stripeIdentityDetails)
      const newIdentityModel = new IdentityModel({
        sessionid: session._id,
        userId: customer._id,
        email: customer.email,
        stripeCustomerID: stripeDetails.stripeCustomerID,
        stripeBrand: stripeDetails.brand,
        last4: stripeDetails.last4,
        exp_month: stripeDetails.exp_month,
        exp_year: stripeDetails.exp_year
      });
      await newIdentityModel.save();
    }
    if (templateId && templateId !== 'null') {
      const template = await DocumentTemplate.findOne({ _id: templateId });
      const uploadedDocument = new DocumentModel({
        sessionid: session._id,
        documentCategory: 'initial_document',
        name: template.key,
        url: template.documentUrl,
        type: 'application/pdf',
        key: template.key,
        bucketName: process.env.AWSBucket,
        uploadedBy: notaryId,
        uploadedStage: 'initial_stage'
      });
      await uploadedDocument.save();

      session.originalDocumentId = uploadedDocument._id;
      session.originalDocumentIds = [uploadedDocument._id];
      await session.save();
      const pdfDroppedElementDataDoc = await PDFDroppedElementsModel.findOne({
        templateid: templateId
      })
      if (pdfDroppedElementDataDoc) {
        const droppedElements = pdfDroppedElementDataDoc.droppedElements || []
        if (droppedElements.length) {
          const newPDFDroppedElementDataDoc = new PDFDroppedElementsModel({
            sessionid: session._id,
            droppedElements
          })
          await newPDFDroppedElementDataDoc.save()
        }
      }
    } else {
      if (files) {
        const allDocumentIdsUploaded = []
        // files
        await Promise.all(_.map(files, async (file) => {
          const uploadedDocument = new DocumentModel({
            sessionid: session._id,
            documentCategory: 'initial_document',
            name: file.originalname,
            url: file.location,
            type: file.mimetype,
            size: file.size,
            key: file.key,
            bucketName: file.bucket,
            uploadedBy: notaryId,
            uploadedStage: 'initial_stage'
          });
          await uploadedDocument.save();
          allDocumentIdsUploaded.push(uploadedDocument._id)
        }));

        session.originalDocumentId = allDocumentIdsUploaded && allDocumentIdsUploaded[0];
        session.originalDocumentIds = allDocumentIdsUploaded;
        await session.save();
      }
    }
    // send email to user
    emailer.sendNotarySignerEmail(
      customer, notaryuser, password, meetingDate, session._id, meetingTimeZone, dontSendTempPassword
    );
    res.status(200).json({
      session,
      email: customer.email
    });
  } catch (error) {
    utils.handleError(res, error);
  }

};

// Fetch sessions
exports.fetchNotarySessions = async (req, res) => {
  const user = req.user;
  req = matchedData(req);
  const showArchievedSessions = req.showArchievedSessions
  try {
    // check if email exists

    const sessionWitnessIds = await SessionWitness.distinct('sessionid', {
      userid: user.id
    })
    console.log('sessionWitnessIds', sessionWitnessIds)
    const sessionIds = req.session_ids || false;
    let sessionFindQuery
    const businessPremiumNotary = await UserNotaryRelation.findOne({
      notaryid: req.notary_user_id,
      relationType: 'invited',
      deleted: {$ne: true}
    })
    if (req.journal) {
      sessionFindQuery = {
        deleted: {$ne: true},
        $or: [
          {
            notaryUserId: req.notary_user_id
          },
          {
            sessionActive: true,
            _id: {$in: sessionWitnessIds}
          }
        ]
      }
    } else if (businessPremiumNotary) {
      sessionFindQuery = {
        deleted: {$ne: true},
        $or: [
          {
            notaryUserId: req.notary_user_id
          },
          {
            sessionActive: true,
            _id: {$in: sessionWitnessIds}
          }
        ]
      }
    } else {
      const testingAccUserDocs = await User.find({
        testingacc: true
      })
      const testingAccUserIds = _.map(testingAccUserDocs, '_id');
      let userDocQuery
      if (user.testingacc) {
        userDocQuery = {$in: testingAccUserIds}
      } else {
        userDocQuery = {$nin: testingAccUserIds}
      }
      sessionFindQuery = {
        deleted: {$ne: true},
        userId: userDocQuery,
        $or: [
          {
            notaryUserId: req.notary_user_id
          },
          {
            $or: [
              {
                notaryUserId: {$exists: false}
              },
              {
                notaryUserId: null
              }
            ],
            sessionActive: true
          },
          {
            $or: [
              {
                notaryUserId: {$exists: false}
              },
              {
                notaryUserId: null
              }
            ],
            sessionOpenCallForTaking: true
          },
          {
            sessionOpenCallForWitness: true
          },
          {
            sessionActive: true,
            _id: {$in: sessionWitnessIds}
          }
        ]
      }
    }
    if (showArchievedSessions) {
      sessionFindQuery.archievedBy = user._id
    } else {
      sessionFindQuery.archievedBy = {$ne: user._id}
    }
    console.log('sessionIds', sessionIds)
    console.log('req.body', req.body)
    console.log('sessionFindQuery', sessionFindQuery)
    // if (sessionIds && sessionIds.length) {
    //   sessionFindQuery._id = {
    //     $in: _.map(sessionIds, (id) => new mongoose.Types.ObjectId(id))
    //   }
    // }
    console.log(sessionFindQuery)
    const sessionWitnessIdsString = _.map(sessionWitnessIds, (tempId) => {
      return String(tempId)
    })
    const sessions = await NewSessionModel.find(sessionFindQuery).sort({createdAt: -1});
    const sessionData = [];
    const allAdditionalSignerEmails = []
    let sessionIdentityDocsKeyed = {}
    const allSessionIds = _.map(sessions, '_id')
    for (const item of sessions) {
      if (item.multiSignerList) {
        _.map(item.multiSignerList, (multiSignerDoc) => {
          if (multiSignerDoc.email) {
            allAdditionalSignerEmails.push(multiSignerDoc.email)
          }
        })
      }
    }
    let additionalSignerEmailUserDocMap = {}
    if (allAdditionalSignerEmails.length) {
      const allAdditionalSignerUserDocs = await User.find({
        email: {$in: allAdditionalSignerEmails}
      })
      additionalSignerEmailUserDocMap = _.keyBy(allAdditionalSignerUserDocs, 'email')
    }
    const sessionIdentityDocs = await IdentityModel.find({
      sessionid: {$in: allSessionIds}
    })
    sessionIdentityDocsKeyed = _.groupBy(sessionIdentityDocs, 'sessionid')
    let completedStatusCount = 0;
    let totalEarning = 0;
    for (const session of sessions) {
      if (typeof session?.stripePaymentData?.[0]?.notaryCharges !== 'undefined') {
        totalEarning = totalEarning + session?.stripePaymentData?.[0]?.notaryCharges
      }
      let finalDocument;
      const customer = await User.findOne({_id: session.userId});
      const document = await DocumentModel.find({ sessionid: session._id, documentCategory: 'initial_document' });
      const identityData = await IdentityModel.findOne({ sessionid: session._id });
      // let finalDocumentId = session.finalDocumentId;
      let videoDataId = session.videoFileDocumentId;
      if (session.paid === false) {
        // finalDocumentId = ''
        videoDataId = ''
      }
      if (session.status === 'complete') {
        completedStatusCount = completedStatusCount + 1
        if (session.paid !== false) {
          finalDocument = await DocumentModel.find({ sessionid: session._id,
            documentCategory: 'final_document_with_dc' });
        }
      } else {
        finalDocument = false;
      }
      let videoData;
      if (session.status === 'complete' && videoDataId) {
        videoData = await DocumentModel.findOne({ _id: videoDataId });
      } else {
        videoData = false
      }
      if (session.sessionActive && session.sessionActiveFrom) {
        const diff = new Date().valueOf() - session.sessionActiveFrom.valueOf()
        const diffMinutes = diff / (60 * 1000)
        if (diffMinutes > SESSION_TIMEOUT_IN_MINUTES) {
          console.log('diffMinutes inside', diffMinutes)
          session.sessionActive = null
          session.sessionActiveFrom = null
          // delete session.sessionActive
          // delete session.sessionActiveFrom
          session.save()
        }
        console.log(session)
      }
      let joinedAsWitness = false
      if (_.includes(sessionWitnessIdsString, String(session._id))) {
        joinedAsWitness = true
      }
      const sessionJoinedUserLog = await SessionUserLogs.findOne({
        sessionid: session._id,
        actionType : 'join_session'
      })
      let sessionStartedTime = false;
      if (sessionJoinedUserLog) {
        sessionStartedTime = sessionJoinedUserLog.createdAt
      }
      const additionalSignerIdentyDocs = []
      const allNotaryIdentities = sessionIdentityDocsKeyed[session._id] || []
      _.map(session.multiSignerList, (multiSignerDoc) => {
        const userDoc = additionalSignerEmailUserDocMap[multiSignerDoc.email]
        let identityDocFound = false
        if (userDoc) {
          _.map(allNotaryIdentities, (tempIdentityDoc) => {
            if (String(tempIdentityDoc.userId) === String(userDoc._id)) {
              additionalSignerIdentyDocs.push(tempIdentityDoc)
              identityDocFound = true
            }
          })
        }
        if (!identityDocFound) {
          additionalSignerIdentyDocs.push(multiSignerDoc)
        }
      })
      // @ts-ignore
      const idcardState = identityData?.cardAPIResponseDoc?.platformresponse?.response?.[0]?.
        cardresult?.[0]?.documentaddress?.[0]?.state?.[0]
      // @ts-ignore
      const idcardExpiry = identityData?.cardAPIResponseDoc?.platformresponse?.response?.[0]?.
        cardresult?.[0]?.documentinformation?.[0]?.expirationdate?.[0]
      sessionData.push({
        session,
        signer: (customer && customer.name) ? customer.name : (customer && customer.email ? customer.email : ''),
        inviteLink: `${process.env.FRONT_URL}/business/prepare_doc/${session._id}`,
        signerEmail: (customer) ? customer.email : '',
        documentName: (document && document[0]) ? document[0].name : 'N/A',
        documentUrl: (document && document[0]) ? document[0].url : '#',
        documents: document,
        finalDocument,
        identityData,
        videoData,
        joinedAsWitness,
        sessionStartedTime,
        additionalSignerIdentyDocs,
        idcardState,
        idcardExpiry
      });
    }
    const recentlyAcceptedSessionsQuery = {
      sessionPickedCallForTakingAt: {$exists: true},
      testingAccSession: {$ne: true}
    }
    const recentlyAcceptedSessions = await NewSessionModel.find(recentlyAcceptedSessionsQuery)
    .sort({sessionPickedCallForTakingAt: -1}).limit(5);
    res.status(200).json({sessionData, recentlyAcceptedSessions, completedStatusCount,
      totalEarning: totalEarning / 100});
  } catch (error) {
    utils.handleError(res, error);
  }
};

// Cron - check expired Documents
exports.checkExpiredDocument = async (req, res) => {
  console.log('check expired document');
  try {
    const today = new Date();
    const yesterdayDate = today.setDate(today.getDate() - 1);
    const sessions = await NewSessionModel.find({
      status: 'unsigned',
      createdAt: {
          $lte: new Date(yesterdayDate)
      }
    });
    console.log('yesterday', yesterdayDate);
    console.log('sessions', sessions.length);
    if (sessions.length) {
      for (const session of sessions) {
        // check if is there any document, remove it
        const document = await DocumentModel.findOne({ sessionid: session._id });
        if (document) {
          await document.remove();
        }
        // revert session stage to initial stage
        session.currentStage = 'initial_stage';
        // set session to expired
        session.status = 'expired';
        // add stage history.
        session.stagesHistory.push({
          stageName: 'Expired Status set by Cron after 24hours of session create',
          stageDate: new Date()
        });

        // save session
        await session.save();
      }
    }
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};

exports.checkExpiredCommissionLetter = async (req, res) => {
  console.log('check expired commission');
  try {
    const notarydata = await NotaryDataModel.find({
      commissionExpiresOn: {
          $lt: new Date().getTime() / 1000 - 3600
      }
    });
    if (notarydata.length) {
      for (const data of notarydata) {
        const notaryUser = await User.findOne({
          _id: data.userId
        });
        if (notaryUser.approve === 'active') {
          notaryUser.approve = 'inactive';
          notaryUser.isCommissionExpired = true;
          await notaryUser.save();
          emailer.sendCommissionExpiredEmailMessage(notaryUser);
        }
      }
    }
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};

// Cron - check expired Sessions
exports.checkExpiredSession = async () => {
  console.log('check expired session');
  try {
    const today = new Date();
    const lastTwoDaysDate = today.setDate(today.getDate() - 2);
    const lastSevenDaysDate = today.setDate(today.getDate() - 7);
    const sessions = await NewSessionModel.find({
      $or: [
        {
          notorizationTiming: 'notarize_later',
          meetingdatetimeobj: {
            $lte: new Date(lastTwoDaysDate)
          },
          status: {
            $nin: ['complete', 'expired']
          }
        },
        {
          notorizationTiming: 'notarize_now',
          createdAt: {
            $lte: new Date(lastTwoDaysDate)
          },
          status: {
            $nin: ['complete', 'expired']
          }
        },
        {
          notorizationTiming: {$exists: false},
          createdAt: {
            $lte: new Date(lastSevenDaysDate)
          },
          status: {
            $nin: ['complete', 'expired']
          }
        }
      ]
    });
    console.log('lastTwoDaysDate', lastTwoDaysDate);
    console.log('sessionsMarkedAsExpired', sessions.length, _.map(sessions, '_id'));
    if (sessions) {
      for (const session of sessions) {
        // check if is there any document, remove it
        // const document = await DocumentModel.findOne({ sessionid: session._id });
        // if (document) {
        //   await document.remove();
        // }
        // revert session stage to initial stage
        // session.currentStage = 'initial_stage';
        // set session to expired
        session.status = 'expired';
        // add stage history.
        session.stagesHistory.push({
          stageName: 'Expired Status set by Cron after 7 days of session create',
          stageDate: new Date()
        });

        // save session
        await session.save();
      }
    }
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};

// Cron - reminder users for upcoming sessions before 1 hour -- we run this script
// every 10 mins to check if any session in next 50-60 minutes range
exports.checkForSessionsInNextHourAndSendReminderEmail = async () => {
  console.log('checking sessions in next 50-60 ');
  try {
    const next50Minutes = moment().add(50, 'minutes')
    const next60Minutes = moment().add(60, 'minutes')
    console.log(next50Minutes, next60Minutes)
    const sessions = await NewSessionModel.find({
      status: {
        $nin: ['complete', 'expired']
      },
      meetingdatetimeobj: {
        $gt: next50Minutes,
        $lte: next60Minutes
      }
    });
    // console.log('lastSevenDaysDate', lastSevenDaysDate);
    console.log('sessions', sessions.length);
    _.map(sessions, async (sessionDoc) => {
      console.log(sessionDoc)
      const sessionUserId = sessionDoc.userId;
      const sessionNotaryId = sessionDoc.notaryUserId;
      const allUserIds = [sessionUserId]
      if (sessionNotaryId) {
        allUserIds.push(sessionNotaryId)
      }
      const userDocs = await User.find({
        _id: {$in: allUserIds}
      })
      const shortSessionID = (sessionDoc._id).toString().substr((sessionDoc._id).toString().length - 5).toUpperCase();
      _.map(userDocs, (userDoc) => {
        emailer.sendSessionReminderEmails(userDoc, sessionDoc.meetingdatetimeobj, shortSessionID)
      })
    })
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};

// Cron - reminder users for sessions which are passed 1 hour ago, but session not done
// -- we run this script every 10 mins to check if any session passed in 50-60 minutes range
exports.checkForSessionsForWhichSessionTimeHasPassedAndSessionNotDone = async () => {
  console.log('checking sessions in next 50-60 ');
  try {
    const past50Minutes = moment().subtract(50, 'minutes')
    const past60Minutes = moment().subtract(60, 'minutes')
    console.log(past50Minutes, past60Minutes)
    const sessions = await NewSessionModel.find({
      status: {
        $nin: ['complete', 'expired']
      },
      meetingdatetimeobj: {
        $gt: past60Minutes,
        $lte: past50Minutes
        // $gt: past50Minutes,
        // $lte: past60Minutes
      }
    });
    // console.log('lastSevenDaysDate', lastSevenDaysDate);
    console.log('query', {
      $gt: past60Minutes,
      $lte: past50Minutes
    })
    console.log('sessions', sessions.length);
    _.map(sessions, async (sessionDoc) => {
      console.log(sessionDoc)
      const sessionUserId = sessionDoc.userId;
      // const sessionNotaryId = sessionDoc.notaryUserId;
      const allUserIds = [sessionUserId]
      // if (sessionNotaryId) {
      //   allUserIds.push(sessionNotaryId)
      // }
      const userDocs = await User.find({
        _id: {$in: allUserIds}
      })
      const shortSessionID = (sessionDoc._id).toString().substr((sessionDoc._id).toString().length - 5).toUpperCase();
      _.map(userDocs, (userDoc) => {
        emailer.sendSessionDueEmails(userDoc, sessionDoc.meetingdatetimeobj, shortSessionID)
      })
    })
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};

// Cron - precompute onboarding status
exports.precomputeOnboardingStatusOfNotaries = async () => {
  console.log('onboarding status');
  try {
    const allNotaryDatasWithCommissionLetter = await NotaryDataModel.find({
      notaryCopyOfCommissionLetterName: {$exists: true},
      stripeAccountName: {$exists: true},
      commissionExpiresOn: {$exists: true}
    })
    console.log('allNotaryDatasWithCommissionLetter', allNotaryDatasWithCommissionLetter.length)
    const allNotaryDatasKeyed = _.keyBy(allNotaryDatasWithCommissionLetter, 'userId')
    console.log({
      _id: {$in: _.map(allNotaryDatasWithCommissionLetter, 'userId')},
      role : 'notary',
      localOnboardingFilledFlag: {$ne: true}
    })
    const notaryUsersForOnboarding = await User.find({
      _id: {$in: _.map(allNotaryDatasWithCommissionLetter, 'userId')},
      role : 'notary',
      localOnboardingFilledFlag: {$ne: true},
      approve : {$ne: 'active'}
    })
    console.log('notaryUsersForOnboarding', notaryUsersForOnboarding.length)
    _.map(notaryUsersForOnboarding, async (notaryUserDoc) => {
      const tempNotaryDataDoc = allNotaryDatasKeyed[notaryUserDoc._id];
      let onBoarding = false;
      let stripeToUse;
      if (notaryUserDoc.testingacc) {
        stripeToUse = stripeTest;
      } else {
        stripeToUse = stripe;
      }
      const account = await stripeToUse.accounts.retrieve(tempNotaryDataDoc.stripeAccountName);
      if (account &&
        account.requirements &&
        account.requirements.errors &&
        account.requirements.errors.length > 0) {
        onBoarding = false;
      } else {
        onBoarding = true;
      }
      if (onBoarding && account &&
        account.capabilities &&
        account.capabilities.transfers !== 'active') {
        onBoarding = false;
      }
      console.log('onBoarding', onBoarding)
      if (onBoarding) {
        notaryUserDoc.localOnboardingFilledFlag = true
        await notaryUserDoc.save()
      }
    })
    return true
  } catch (error) {
    console.log(error);
    return false;
  }
};

exports.uploadCustomerPhotoID = async (req, res) => {
  try {
    const user = req.user;
    let message = '';
    const file = req.file
    console.log(file);
    req = matchedData(req);
    const photoIdCaptureMethod = req.photoIdCaptureMethod
    const typeOfPhotoId = req.typeOfPhotoId
    const sessionDoc = await NewSessionModel.findOne({
      _id: req.sessionId
    })
    let typeOfKBA = ''
    if (sessionDoc && sessionDoc.typeOfKBA) {
      typeOfKBA = sessionDoc.typeOfKBA
    }
    console.log('sessionDoc', sessionDoc)
    console.log('typeOfKBA', typeOfKBA)
    if (file) {
      console.log(file);
      const identityModel = await IdentityModel.exists({ sessionid: req.sessionId, userId: user._id });
      let additionalSigner = false;
      if (req.additionalSigner) {
        additionalSigner = true
      }
      console.log('identityModel', identityModel)
      if (!identityModel) {
        if (req.documentType === 'front') {
          const newIdentityModel = new IdentityModel({
            sessionid: req.sessionId,
            frontPhotoIdName: file.originalname,
            frontPhotoIdUrl: file.location,
            frontPhotoIdType: file.mimetype,
            frontPhotoIdSize: file.size,
            frontPhotoIdKey: file.key,
            frontPhotoIdBucketName: file.bucket,
            additionalSigner,
            photoIdCaptureMethod,
            typeOfPhotoId
          });
          message = 'Front photo ID uploaded successfully.';
          await newIdentityModel.save();
        } else {
          const newIdentityModel = new IdentityModel({
            sessionid: req.sessionId,
            backPhotoIdName: file.originalname,
            backPhotoIdUrl: file.location,
            backPhotoIdType: file.mimetype,
            backPhotoIdSize: file.size,
            backPhotoIdKey: file.key,
            backPhotoIdBucketName: file.bucket,
            additionalSigner,
            photoIdCaptureMethod,
            typeOfPhotoId
          });
          await newIdentityModel.save();
          // if (photoIdCaptureMethod !== 'upload_via_webcam' && typeOfKBA !== 'passport') {
          //   const backPhotoIdValidationPassed = await checkBackPhotoId(file.key, req.sessionId, file.originalname);
          //   message = 'Back photo ID uploaded successfully.';
          //   console.log(backPhotoIdValidationPassed)
          //   if (!backPhotoIdValidationPassed) {
          //     message = 'Back Image Validation Failed. Please use clearer image and reupload'
          //   } else {
          //     await newIdentityModel.save();
          //   }
          // } else {
          //   await newIdentityModel.save();
          // }
        }
        res.status(200).json({ message, type: req.documentType });
      } else {
        const identityData = await IdentityModel.findOne({ sessionid: req.sessionId, userId: user._id });
        if (req.documentType === 'front') {
          identityData.frontPhotoIdUrl = file.location;
          identityData.frontPhotoIdKey = file.key;
          identityData.frontPhotoIdName = file.originalname;
          identityData.frontPhotoIdType = file.mimetype
          identityData.frontPhotoIdSize = file.size
          identityData.frontPhotoIdBucketName = file.bucket
          identityData.photoIdCaptureMethod = photoIdCaptureMethod
          identityData.typeOfPhotoId = typeOfPhotoId
          message = 'Front photo ID updated successfully.';
          await identityData.save();
        } else {
          identityData.backPhotoIdUrl = file.location;
          identityData.backPhotoIdKey = file.key;
          identityData.backPhotoIdName = file.originalname;
          identityData.backPhotoIdType = file.mimetype
          identityData.backPhotoIdSize = file.size
          identityData.backPhotoIdBucketName = file.bucket
          identityData.photoIdCaptureMethod = photoIdCaptureMethod
          identityData.typeOfPhotoId = typeOfPhotoId
          await identityData.save();
          // if (photoIdCaptureMethod !== 'upload_via_webcam' && typeOfKBA !== 'passport') {
          //   const backPhotoIdValidationPassed = await checkBackPhotoId(file.key, req.sessionId, file.originalname);
          //   console.log(backPhotoIdValidationPassed)
          //   message = 'Back photo ID updated successfully.';
          //   if (!backPhotoIdValidationPassed) {
          //     message = 'Back Image Validation Failed. Please use clearer image and reupload'
          //   } else {
          //     await identityData.save();
          //   }
          // } else {
          //   await identityData.save();
          // }
        }
        res.status(200).json({ message });
      }
    } // if file check
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.expireSessionDocuments = async (req, res) => {
  try {
    console.log('in cron to expire session documents');
    // after 24hrs, if no update, remove document and set the session status to "expired"
    await controller.checkExpiredDocument();
    // after 7days, status is not completed  remove document and set the session status to "expired"
    await controller.checkExpiredSession();
    res.status(200).json({ status: true });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.saveUserDetails = async (req, res) => {
  try {
    const user = req.user
    const userDetailsDoc = new UserDetails({
      userId: user._id,
      ip: String(req.ip),
      browser: req.headers['user-agent'],
      country: req.headers['accept-language']
    })
    await userDetailsDoc.save()
    res.status(200).json({ status: true });
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.setSessionStageOrStatus = async (req, res) => {
  const sessionid = req.params && req.params.id
  if (!sessionid) {
    res.status(400).json({
      error: 'Session id not found'
    })
  }
  const user = req.user;
  const type = req.query.type;
  const value = req.query.value;
  const additionalSigner = req.query.additionalSigner;

  try {
    const session = await NewSessionModel.findOne({
      _id: sessionid
    });
    if (session && type && value) {
      if (additionalSigner) {
        if (type === 'stage') {
          const identityData = await IdentityModel.findOne({ sessionid, userId: user._id });
          if (identityData) {
            identityData.additionalSignerNextStage = value;
          }
          await identityData.save();
        }
      } else {
        if (type === 'stage') {
          session.currentStage = value;
        }

        if (type === 'status') {
          session.status = value;
        }

        session.stagesHistory.push({
          stageName: `${type} - ${value}`,
          stageDate: new Date()
        });

        await session.save();
      }
      res.status(200).json({status: true});
    }
    res.status(200).json({status: false});
  } catch (error) {
    utils.handleError(res, error);
  }
}

exports.isValidSession = async (req, res) =>  {
  const sessionid = req.params && req.params.id
  if (!sessionid) {
    return res.status(200).json({
      status: false
    });
  }

  try {
    const session = await NewSessionModel.findOne({
      _id: sessionid
    });
    if (session) {
      // if (session.status === 'expired' ||
      //   session.status === 'complete' ||
      //   session.currentStage === 'identity_check_stage_fail' ||
      //   session.currentStage === 'kba_check_stage_fail'  ||
      //   session.currentStage === 'photoid_check_stage_fail') {
      //   return res.status(200).json({status: false, session});
      // }
      return res.status(200).json({status: true, session});
    }
    return res.status(200).json({status: false});
  } catch (error) {
    return utils.handleError(res, error);
  }
}

async function getObject (bucket, objectKey) {
  try {
    const params = {
      Bucket: bucket,
      Key: objectKey
    }
    console.log(params)
    return await s3.getObject(params).promise();
  } catch (e) {
    const err = e as any;
    throw new Error(`Could not retrieve file from S3: ${err.message}`)
  }
}

async function upload (bucket, objectKey, buf, contentType) {
  try {
    const params = {
      Bucket: bucket,
      Key: objectKey,
      Body: buf,
      ACL: 'public-read',
      ContentEncoding: 'base64',
      ContentType: contentType
    };

    return await s3.upload(params).promise();
  } catch (e) {
    const err = e as any;
    throw new Error(`Could not upload file from S3: ${err.message}`)
  }
}

const signDocument = async (pdfKey, p12Key, sessionid, reason,
                            {dcPassword, contactInfo, name, location, notaryUserId}) => {
  const pdf = await getObject(process.env.AWSBucket, pdfKey);
  let objectKeyStr = p12Key;
  if (!p12Key.includes('.p12') && !p12Key.includes('.pfx')) {
    objectKeyStr = p12Key + '.p12'
  }
  console.log('objectKeyStr while signing', objectKeyStr)
  const DCBuffer = await getObject(process.env.AWSBucket, objectKeyStr);
  const objectKey = `${sessionid}_${Math.floor(Math.random() * 999)}_signed_pdf.pdf`
  const signatureLength = DCBuffer.Body.toString().length
  let inputBuffer;
  try {
    inputBuffer = plainAddPlaceholder({
      pdfBuffer: pdf.Body,
      reason,
      contactInfo,
      name,
      location,
      signatureLength
    });
  } catch (error) {
    console.log(error)

    const inputFile = './tmp/' + sessionid + '_input.pdf'
    const outputFile = './tmp/' + sessionid + '_output.pdf'
    await fs.createWriteStream(inputFile).write(pdf.Body);

    const { stdout, stderr } = await exec('gs -o ' + outputFile +
      ' -sDEVICE=pdfwrite -dPDFSETTINGS=/prepress ' + inputFile);

    console.log('stdout:', stdout);
    console.log('stderr:', stderr);

    const content = fs.readFileSync(outputFile);
    inputBuffer = plainAddPlaceholder({
      pdfBuffer: content,
      reason,
      contactInfo,
      name,
      location,
      signatureLength
    });
  }
  console.log('ready to sign')
  const signedPdf = signer.sign(inputBuffer, DCBuffer.Body, {passphrase: dcPassword || 'bnDCpwd21'})
  const signedFile = await upload(process.env.AWSBucket, objectKey, signedPdf, 'application/pdf')
  const uploadedDocument = new DocumentModel({
    sessionid,
    documentCategory: 'final_document_with_dc',
    name: objectKey,
    url: signedFile.Location,
    type: 'application/pdf',
    size: signedPdf.length,
    key: objectKey,
    bucketName: signedFile.Bucket,
    uploadedBy: notaryUserId,
    uploadedStage: 'document_with_dc'
  });
  console.log('uploadedDocument', uploadedDocument)
  await uploadedDocument.save();
  return uploadedDocument;
}

const processChargesForSession = async (sessions, notaries, user) =>  {
  let paymentDone = 'failure';
  if (!sessions) {
    return paymentDone
  }
  if (sessions.paid) {
    return 'success'
  }
  console.log('sessions', sessions)

  // const { costOfNotarization } = sessions;
  console.log('costOfNotarization', sessions.costOfNotarization)
  console.log('sessionCustomCharges', sessions.sessionCustomCharges)

  const notaryUserDoc = await User.findOne({
    _id: sessions.notaryUserId
  })

  // Determining which pricing strategy to use
  let stateToUse = 'Others'
  if (notaryUserDoc && notaryUserDoc.state) {
    stateToUse = notaryUserDoc.state
  }
  let pricingDoc = PricingJson.pricing[stateToUse]
  let statePricingUsed = true;
  if (stateToUse === 'Others') {
    statePricingUsed = false;
  }
  if (!pricingDoc) {
    statePricingUsed = false;
    pricingDoc = PricingJson.pricing.Others
  }
  console.log('pricingDoc', pricingDoc)

  const customerUserDoc = await User.findOne({
    _id: sessions.userId
  })
  let invitedByCustomerUserDoc;
  if (sessions.invitedByCustomer) {
    invitedByCustomerUserDoc = await User.findOne({
      _id: sessions.invitedByCustomer
    })
  }
  const businessUserSubsidizedSession = await getBusinessUserSubsidizedSession(sessions,
    customerUserDoc, invitedByCustomerUserDoc)
  console.log('businessUserSubsidizedSession', businessUserSubsidizedSession)
  let notaryFee = '25.00';
  // if (pricingDoc && pricingDoc.notaryFee) {
  //   notaryFee = pricingDoc.notaryFee;
  // }
  // For Loan Signings, we pay 125$ flat to notary
  if (sessions.sessionType === 'loan_signing') {
    notaryFee = '125.00'
  }
  if (sessions.sessionChargeOnBusinessUser) {
    notaryFee = '0.00'
  }
  let notaryFeeFloat = parseFloat(notaryFee) * 100

  if (sessions.sessionCustomCharges) {
    _.map(sessions.sessionCustomCharges, (extraChargeDoc) => {
      const extraChargeAmount = parseFloat(extraChargeDoc.amount) * 100;
      notaryFeeFloat += extraChargeAmount
    })
    console.log('notaryFeeFloat', notaryFeeFloat)
  }

  // if (notaryUserDoc.notaryCustomCharges) {
  //   let extraChargesDocs = [];
  //   if (sessions.sessionType) {
  //     extraChargesDocs = notaryUserDoc.notaryCustomCharges[sessions.sessionType] || [];
  //   } else {
  //     extraChargesDocs = notaryUserDoc.notaryCustomCharges.gnw || [];
  //   }
  //   console.log('extraChargesDocs', extraChargesDocs)
  //   _.map(extraChargesDocs, (extraChargeDoc) => {
  //     const extraChargeAmount = parseFloat(extraChargeDoc.amount) * 100;
  //     notaryFeeFloat += extraChargeAmount
  //   });
  //   console.log('notaryFeeFloat', notaryFeeFloat)
  // }

  // let serviceFee = '2.00';
  // if (pricingDoc && pricingDoc.serviceFee) {
  //   serviceFee = pricingDoc.serviceFee;
  // }
  // const serviceFeeFloat = parseFloat(serviceFee) * 100

  let extraSeal = '8.00';
  if (pricingDoc && pricingDoc.extraSeal) {
    extraSeal = pricingDoc.extraSeal;
  }
  // const extraSealFloat = parseFloat(extraSeal) * 100
  let extraSealFloatUsd = parseFloat(extraSeal)

  if (businessUserSubsidizedSession && sessions.sessionType !== 'loan_signing') {
    notaryFeeFloat = 0
    extraSealFloatUsd = 0
  }

  // charge the customer
  let totalCost = 0;
  if (sessions.finalCostOfNotarization !== null) {
    totalCost = parseFloat(sessions.finalCostOfNotarization.replace('$', '')) * 100;
  }

  // Full Notary Charges are going to BN. So not adding any Notary charges calculation here

  let notaryCharges = 0
  const stripeCharges = 30 + parseInt(String(totalCost * 2.9 / 100), 10)

  let witnessChargesPaid = false;
  _.map(sessions.costOfNotarization, (costDoc) => {
    if (costDoc.name.includes('Witness') || costDoc.name.includes('witness')) {
      witnessChargesPaid = true
    }
  })

  if (statePricingUsed) {
    _.map(sessions.costOfNotarization, (costDoc) => {
      if (costDoc.name.indexOf('Notarization') !== -1) {
        notaryCharges += notaryFeeFloat
      } else if (costDoc.name.indexOf('Extra') !== -1) {
        const extraSeals = parseInt(String(parseFloat(costDoc.price) / extraSealFloatUsd), 10)
        notaryCharges += (extraSeals * 400)
      }
    })
    // notaryCharges += (0.5 * serviceFeeFloat)
  } else {
    _.map(sessions.costOfNotarization, (costDoc) => {
      if (costDoc.name.indexOf('Notarization') !== -1) {
        notaryCharges += notaryFeeFloat
      } else if (costDoc.name.indexOf('Extra') !== -1) {
        const extraSeals = parseInt(String(parseFloat(costDoc.price) / extraSealFloatUsd), 10)
        notaryCharges += (extraSeals * 400)
      }
    })
  }

  let bnCharges = 0
  let notaryStripeAccountName = ''

  const notarydm = await NotaryDataModel.findOne({userId: sessions.notaryUserId})

  if (notarydm && notarydm.stripeAccountName) {
    notaryStripeAccountName = notarydm.stripeAccountName
    bnCharges = totalCost - notaryCharges
    // bnCharges = totalCost - notaryCharges - stripeCharges
  }
  console.log(totalCost, bnCharges, notaryStripeAccountName, notaryCharges, stripeCharges)
  // const stripeChargesDoc = {
  //   amount: totalCost,
  //   description: `Charged for session #${sessions._id}`,
  //   currency: 'USD',
  //   customer: notaries.stripeCustomerID,
  //   application_fee_amount: null,
  //   transfer_data: {}
  // }

  // if (notaryStripeAccountName) {
  //   stripeChargesDoc.application_fee_amount = bnCharges;
  //   stripeChargesDoc.transfer_data = {
  //     destination: notaryStripeAccountName
  //     // amount: notaryCharges
  //   }
  // } else {
  //   delete stripeChargesDoc.application_fee_amount
  //   delete stripeChargesDoc.transfer_data
  // }
  // console.log('stripeChargesDoc', stripeChargesDoc)

  if (!totalCost) {
    sessions.paid = true
    await sessions.save();
    paymentDone = 'success'
    return paymentDone
  }

  let stripeToUse;
  if (user.testingacc) {
    stripeToUse = stripeTest
  } else {
    stripeToUse = stripe
  }

  const stripeChargesDoc = {
    amount: totalCost,
    description: `Charged for session #${sessions._id}`,
    currency: 'USD',
    customer: notaries.stripeCustomerID,
    transfer_data: {}
  }
  const charge = await stripeToUse.charges.create(stripeChargesDoc);
  console.log('charge', charge)

  // Implementing the mechanism where BN gets full payment, and then BN disburses
  // the sub payments to needed parties using stripe payment intent and stripe transfers
  const transferGroup = sessions._id + '_' + Math.floor(Math.random() * 999)

  let paymentIntentCost = 0
  const allStripeTransfers = []

  if (notaryStripeAccountName && notaryCharges && !sessions.sessionChargeOnBusinessUser) {
    console.log('notaryCharges', notaryCharges)
    allStripeTransfers.push({
      amount: notaryCharges,
      currency: 'usd',
      destination: notaryStripeAccountName,
      transfer_group: transferGroup,
      source_transaction: charge.id
    })
    paymentIntentCost += notaryCharges
  }

  if (witnessChargesPaid) {
    // Currently Supporting only 1 session witness from BN
    // Witness cost is 10$. 5 goes to BN, 5 goes to witness notary
    const allUserSessionWitnesses = await SessionWitness.findOne({
      sessionid: sessions._id,
      userid: {$exists: true}
    })

    if (allUserSessionWitnesses) {
      const sessionUserNotaryDoc = await NotaryDataModel.findOne({userId: allUserSessionWitnesses.userid})
      if (sessionUserNotaryDoc && sessionUserNotaryDoc.stripeAccountName) {
        allStripeTransfers.push({
          amount: 500,
          currency: 'usd',
          destination: sessionUserNotaryDoc.stripeAccountName,
          transfer_group: transferGroup,
          source_transaction: charge.id
        })
        paymentIntentCost += 500
      }
    }
  }
  console.log('allStripeTransfers', allStripeTransfers)
  console.log('paymentIntentCost', paymentIntentCost)

  if (paymentIntentCost) {
    const paymentIntent = await stripeToUse.paymentIntents.create({
      amount: paymentIntentCost,
      currency: 'usd',
      transfer_group: transferGroup
    });

    console.log('paymentIntent', paymentIntent)
    _.map(allStripeTransfers, (internalStripeTransfer) => {
      stripeToUse.transfers.create(internalStripeTransfer)
    })
  }

  if (charge && charge.paid === true) {
    const customerId = sessions.userId
    const customerDoc = await User.findOne({
      _id: customerId
    })
    if (customerDoc) {
      emailer.sendMailWhenSessionIsCompleted(String(sessions._id), customerDoc.name, customerDoc.email);
    }
    sessions.paid = true
    sessions.stripePaymentData = {
      chargeId: charge.id,
      customerId: charge.customer,
      paid: charge.paid,
      receiptUrl: charge.receipt_url,
      status: charge.status,
      notaryCharges
    }
    await sessions.save();
    paymentDone = 'success'
  } else {
    sessions.paid = false
    console.log('sessions.paid', sessions.paid)
    await sessions.save();
  }
  return paymentDone
}

const saveTheIndividualFailedStreams = async (sessiondoc, fileNamesList) =>  {
  try {
    await Promise.all(_.map(fileNamesList, async (filename) => {
      const fileContent = fs.readFileSync(filename);
      const stats = fs.statSync(filename)
      const objectKey = filename.replace('./tmp/', '')
      const signedFile = await upload(process.env.AWSBucket, objectKey, fileContent, 'video/webm')
      const uploadedDocument = new DocumentModel({
        sessionid: sessiondoc._id,
        documentCategory: 'temp_video_recording_file',
        name: objectKey,
        url: signedFile.Location,
        type: 'video/webm',
        size: stats.size,
        key: objectKey,
        bucketName: signedFile.Bucket,
        uploadedStage: 'document_with_dc'
      });
      await uploadedDocument.save();
    }));
  } catch (error) {
    console.log('error')
    _.map(fileNamesList, (tempfile) => {
      try {
        fs.unlinkSync(tempfile);
      } catch (error) {
        console.log(error)
      }
    })
  }
}

const checkIfDCPasswordIsValid = async(p12Key, dcPassword) => {
  try {
    let pdfKey = '1650390519829Deed-of-Trust.pdf'
    console.log(process.env.NODE_ENV)
    if (process.env.NODE_ENV === 'development') {
      pdfKey = '1647080435440test_order.pdf'
    }
    const pdf = await getObject(process.env.AWSBucket, pdfKey);
    const PdfBody = pdf.Body as string
    const pdfDoc = await PDFDocument.load(PdfBody, {
      ignoreEncryption: true
    });
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    const pdfBuffer = Buffer.from(pdfBytes)
    let objectKeyStr = p12Key;
    if (!p12Key.includes('.p12') && !p12Key.includes('.pfx')) {
      objectKeyStr = p12Key + '.p12'
    }
    console.log('objectKeyStr', objectKeyStr)
    const DCBuffer = await getObject(process.env.AWSBucket, objectKeyStr);
    const signatureLength = DCBuffer.Body.toString().length
    const inputBuffer = plainAddPlaceholder({
      pdfBuffer,
      reason: 'Signed Certificate By Blue Notary.',
      contactInfo: 'test',
      name: 'test',
      location: 'US',
      signatureLength
    });
    signer.sign(inputBuffer, DCBuffer.Body, {passphrase: dcPassword || 'bnDCpwd21'})
    return true
  } catch (error) {
    console.log(error)
    return false
  }
}

const checkBackPhotoId = async (backFileKey, sessionid, fileName) => {
  try {
    const pdf = await getObject(process.env.AWSBucket, backFileKey);
    const PdfBody = pdf.Body as string
    let inputFile = './tmp/' + String(sessionid) + String(fileName)
    console.log('initial', inputFile)
    inputFile = inputFile.replace(/[^a-zA-Z.\/\-\_0-9]/g, '')
    console.log('after', inputFile)
    await fs.writeFileSync(inputFile, PdfBody)
    const { stdout, stderr } = await exec('zxing --try-harder ' + inputFile);
    // fs.unlinkSync(inputFile);
    console.log('stdout', stdout)
    console.log('stderr', stderr)
    let backImagePassed = false;
    if (_.includes(stdout, 'Decoded TEXT')) {
      backImagePassed = true
    }
    if (_.includes(stdout, 'Raw text')) {
      backImagePassed = true
    }
    if (_.includes(stdout, 'Failed')) {
      backImagePassed = false
    }
    console.log('backImagePassed', backImagePassed)
    return backImagePassed;
  } catch (error) {
    console.log(error)
    return false
  }
}
exports.createCustomerBillingPortal = async (req, res) => {
  try {
    const user = req.user
    req = matchedData(req);

    const notarydm = await NotaryDataModel.findOne({ userId: user._id });

    let stripeToUse;
    if (user.testingacc) {
      stripeToUse = stripeTest
    } else {
      stripeToUse = stripe
    }

    if (notarydm && notarydm.stripeAccountName) {
      // const account = await stripeToUse.accounts.retrieve(
      //   notarydm.stripeAccountName
      // );
      // res.status(200).json({account});
      const session = await stripeToUse.billingPortal.sessions.create({
        customer: notarydm.stripeAccountName,
        return_url: 'http://localhost:8080'
      });

      res.redirect(session.url);

    }

    // Authenticate your user.
  } catch (error) {
    utils.handleError(res, error);
  }
};

exports.createCustomerPortalSession = async (req, res) => {
  try {
    const user = req.user
    const notarydm = await NotaryDataModel.findOne({ userId: user._id })
    if (!notarydm) {
      return res.status(400).json({
        error: true,
        errorMessage: 'Notary Data not found'
      })
    }
    let stripeToUse;
    if (user.testingacc) {
      stripeToUse = stripeTest
    } else {
      stripeToUse = stripe
    }
    let returnUrl = 'https://app.bluenotary.us/notary/account-settings'
    if (process.env.NODE_ENV === 'development') {
      returnUrl = 'http://localhost:8080/notary/account-settings'
    }
    const notaries = await IdentityModel.findOne({ userId: user._id })
    const { stripeCustomerID = null } = notaries;
    if (!notaries || !stripeCustomerID) {
      return res.status(400).json({
        error: true,
        errorMessage: 'Notary Stripe customerId not found'
      })
    } else {
      const session = await stripeToUse.billingPortal.sessions.create({
        customer: stripeCustomerID,
        return_url: returnUrl
      });
      res.redirect(session.url);
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.notaryEmailLogoUpload = async (req, res) => {
  try {
    const file = req.file
    const user = req.user
    req = matchedData(req);
    if (file) {
      const notaryUser = await User.findOne({_id: user._id});
      if (notaryUser) {
        const updatedNotaryUser = await User.findByIdAndUpdate(notaryUser.id,
        {$set: {emailLogoName: file.originalname, emailLogoUrl: file.location, emailLogoKey: file.key}},
        {new: true}).exec();
        res.status(200).json({
          message: 'Logo uploaded successfully.',
          user: updatedNotaryUser
        });
      }

    } else {
      res.status(200).json({ error: true });
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.checkingPhotoIdRealTime = async (req, res) => {
  try {
    const file = req.file
    req = matchedData(req);
    const sessionid = req.sessionid
    const filename = req.filename
    if (file) {
      const response = await checkBackPhotoId(file.key, sessionid, filename)
      console.log('backid checking response', response)
      res.status(200).json({
        passed: response
      })
    } else {
      res.status(200).json({
        passed: false
      })
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.updateEmailCustomMessage = async (req, res) => {
  try {
    const user = req.user
    const body = req.body;
    const notaryUser = await User.findOne({_id: user._id});

    if (notaryUser) {
        const updatedNotaryUser = await User.findByIdAndUpdate(
          notaryUser.id, {$set: {emailCustomMessage: body.customMessage }}, {new: true}
        ).exec();
        res.status(200).json({
          message: 'Message saved successfully.',
          user: updatedNotaryUser
        });
      } else {
      res.status(200).json({ error: true });
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.updateEmailSetting = async (req, res) => {
  try {
    const user = req.user
    const body = req.body;
    const notaryUser = await User.findOne({_id: user._id});

    if (notaryUser) {
        const updatedNotaryUser = await User.findByIdAndUpdate(
          notaryUser.id, {$set: {sendBrandEmails: body.sendBrandEmails }}, {new: true}
        ).exec();
        res.status(200).json({
          message: 'Setting updated successfully.',
          user: updatedNotaryUser
        });
      } else {
      res.status(200).json({ error: true });
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.createCustomerPortalSession = async (req, res) => {
  try {
    const user = req.user
    const notarydm = await NotaryDataModel.findOne({ userId: user._id })
    if (!notarydm) {
      return res.status(400).json({
        error: true,
        errorMessage: 'Notary Data not found'
      })
    }
    let stripeToUse;
    if (user.testingacc) {
      stripeToUse = stripeTest
    } else {
      stripeToUse = stripe
    }
    let returnUrl = 'https://app.bluenotary.us/notary/account-settings'
    if (process.env.NODE_ENV === 'development') {
      returnUrl = 'http://localhost:8080/notary/account-settings'
    }
    const notaries = await IdentityModel.findOne({ userId: user._id })
    const { stripeCustomerID = null } = notaries;
    if (!notaries || !stripeCustomerID) {
      return res.status(400).json({
        error: true,
        errorMessage: 'Notary Stripe customerId not found'
      })
    } else {
      const session = await stripeToUse.billingPortal.sessions.create({
        customer: stripeCustomerID,
        return_url: returnUrl
      });
      res.redirect(session.url);
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.inviteBusinessNotary = async (req, res) => {
  try {
    const user = req.user
    req = matchedData(req);
    const notaryEmail = req.notaryEmail
    let notaryUserDoc = await User.findOne({
      email: notaryEmail
    })
    if (notaryUserDoc && notaryUserDoc.role === 'customer') {
      return res.status(400).json({
        errors: {
          msg: 'Cannot Invite this Notary, as a Customer Account is already created with this email id. Please use other Email id'
        }
      })
    }
    if (notaryUserDoc) {
      const findExistingLinks = await UserNotaryRelation.findOne({
        customerid: user._id,
        notaryid: notaryUserDoc._id,
        relationType: 'invited',
        deleted: {$ne: true}
      })
      if (findExistingLinks) {
        return res.status(400).json({
          errors: {
            msg: 'This Notary is already linked to your Business Account'
          }
        })
      }
    }
    const totalNotaryLinked = await UserNotaryRelation.find({
      customerid: user._id,
      relationType: 'invited',
      deleted: {$ne: true}
    })
    if (totalNotaryLinked && totalNotaryLinked.length >= 3) {
      return res.status(400).json({
        errors: {
          msg: 'You cannot link more than 3 Notaries'
        }
      })
    }
    if (!notaryUserDoc) {
      notaryUserDoc = new User({
        name: 'Pro Notary',
        first_name: 'Pro',
        last_name: 'Notary',
        email: notaryEmail,
        password: utils.generateRandomPassword(6),
        verification: uuid.v4(),
        role: 'notary',
        memberType: 'pro',
        memberTypeProWhenInvited: true,
        businessUserAllowedNotaryToInvite: true,
        notaryInvitedByBusinessUserId: user._id,
        state: '',
        verified: true,
        testingacc: user.testingacc || false
      });
      await notaryUserDoc.save()
      const newProxy = new NotaryDataModel({
        userId: notaryUserDoc._id,
        email: notaryUserDoc.email
      });
      await newProxy.save();
    } else {
      if (notaryUserDoc.memberType === 'free') {
        notaryUserDoc.memberType = 'pro'
        notaryUserDoc.memberTypeProWhenInvited = true
        notaryUserDoc.businessUserAllowedNotaryToInvite = true
        notaryUserDoc.notaryInvitedByBusinessUserId = user._id
        await notaryUserDoc.save()
      }
    }
    const userNotaryRelationDoc = new UserNotaryRelation({
      customerid: user._id,
      notaryid: notaryUserDoc._id,
      relationType: 'invited',
      createdAt: new Date()
    })
    await userNotaryRelationDoc.save()
    emailer.sendEmailToNotaryWhenInvitedByBusinessCustomer(notaryUserDoc, notaryUserDoc.password, user)
    res.status(200).json({ success: true });
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.removeCustomerNotaryLink = async (req, res) => {
  try {
    const user = req.user
    req = matchedData(req);
    const customerNotaryLinkId = req.customerNotaryLinkId
    const userNotaryRelationDoc = await UserNotaryRelation.findOne({
      _id: customerNotaryLinkId,
      customerid: user._id,
      relationType : 'invited'
    })
    if (!userNotaryRelationDoc) {
      return res.status(400).json({
        errors: {
          msg: 'Notary Link Not Found'
        }
      })
    }
    userNotaryRelationDoc.deleted = true
    userNotaryRelationDoc.deletedAt = new Date()
    await userNotaryRelationDoc.save()
    const notaryUserId = userNotaryRelationDoc.notaryid
    const notaryUserDoc = await User.findOne({
      _id: notaryUserId,
      memberType: 'pro',
      memberTypeProWhenInvited: true
    })
    if (notaryUserDoc) {
      notaryUserDoc.memberType = 'free'
      await notaryUserDoc.save()
    }
    res.status(200).json({ success: true });
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.customerGetAllSettings = async (req, res) => {
  try {
    const user = req.user
    let neededUserNotaryRelationDocs = await UserNotaryRelation.find({
      customerid: user._id,
      relationType : 'invited',
      deleted: {$ne: true}
    })
    const userDocs = await User.find({
      _id: {$in: _.map(neededUserNotaryRelationDocs, 'notaryid')}
    })
    const userDocsKeyed = _.keyBy(userDocs, '_id')
    neededUserNotaryRelationDocs = JSON.parse(JSON.stringify(neededUserNotaryRelationDocs))
    neededUserNotaryRelationDocs = _.map(neededUserNotaryRelationDocs, (userNotaryRelationDoc) => {
      userNotaryRelationDoc.notaryDoc = userDocsKeyed[userNotaryRelationDoc.notaryid]
      return userNotaryRelationDoc
    })
    const dataToRespond = {
      userNotaryRelations: neededUserNotaryRelationDocs
    }
    res.status(200).json(dataToRespond);
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.fetchAllSelectableNotaries = async (req, res) => {
  try {
    const user = req.user
    const neededUserNotaryRelationDocs = await UserNotaryRelation.find({
      customerid: user._id,
      relationType : 'invited',
      deleted: {$ne: true}
    })
    const sessionNotaryUserDocs = await NewSessionModel.find({
      userId: user._id,
      notaryUserId: {$exists: true}
    }, {
      notaryUserId: 1,
      createdAt: 1
    })
    const allNotaryIds = _.union(_.map(neededUserNotaryRelationDocs, 'notaryid'), _.map(sessionNotaryUserDocs, 'notaryUserId'))
    console.log('allNotaryIds', allNotaryIds)
    const userDocs = await User.find({
      _id: {$in: allNotaryIds},
      approve: 'active'
    })
    // const userDocsKeyed = _.keyBy(userDocs, "_id")
    const neededUserNotaryRelationDocsKeyed = _.keyBy(neededUserNotaryRelationDocs, 'notaryid')
    // const sessionNotaryUserDocsKeyed = _.keyBy(sessionNotaryUserDocs, 'notaryUserId')
    const finalUserDocs = []
    _.map(userDocs, (userDoc) => {
      let tempDoc
      let userType = {}
      if (neededUserNotaryRelationDocsKeyed[userDoc._id]) {
        tempDoc = neededUserNotaryRelationDocsKeyed[userDoc._id]
        userType = 'Invited By Business'
      }
      // if (sessionNotaryUserDocsKeyed[userDoc._id]) {
      //   tempDoc = sessionNotaryUserDocsKeyed[userDoc._id]
      //   userType = 'Past Session'
      // }
      if (tempDoc) {
        const finalDoc = {
          name: userDoc.name,
          label: userDoc.name,
          email: userDoc.email,
          userType,
          date: tempDoc.createdAt,
          value: userDoc._id
        }
        finalUserDocs.push(finalDoc)
      }
    })
    // neededUserNotaryRelationDocs = JSON.parse(JSON.stringify(neededUserNotaryRelationDocs))
    // neededUserNotaryRelationDocs = _.map(neededUserNotaryRelationDocs, (userNotaryRelationDoc) => {
    //   userNotaryRelationDoc.notaryDoc = userDocsKeyed[userNotaryRelationDoc.notaryid]
    //   return userNotaryRelationDoc
    // })
    const dataToRespond = {
      userNotaryRelations: finalUserDocs
    }
    res.status(200).json(dataToRespond);
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.fillwebhook = async (req, res) => {
  try {
    const body = req.body
    const data = req.data
    console.log('FILEWEBHOOK REQ!!', req)
    console.log('FILEWEBHOOK BODY!!', body)
    console.log('FILEWEBHOOK DATA!!', data)
    res.status(200).json({
      message: 'Webhook passed'
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.fillwebhookPUT = async (req, res) => {
  try {
    const body = req.body
    const data = req.data
    console.log('PUT FILEWEBHOOK BODY!!', body)
    console.log('PUT FILEWEBHOOK DATA!!', data)
    res.status(200).json({
      message: 'Webhook passed'
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};

const getBusinessUserSubsidizedSession = async (newSessionDoc, customerDoc, invitedByCustomerUserDoc) => {
  const notaryUserId = newSessionDoc.notaryUserId;
  const notaryUserDoc = await User.findOne({
    _id: newSessionDoc.notaryUserId
  })
  if ((customerDoc && (customerDoc.memberType === 'business' || customerDoc.memberType === 'agent')) ||
  (invitedByCustomerUserDoc && (invitedByCustomerUserDoc.memberType === 'business' ||
  invitedByCustomerUserDoc.memberType === 'agent')) || (notaryUserDoc && notaryUserDoc.memberTypeProWhenInvited
    && notaryUserDoc.businessUserAllowedNotaryToInvite)) {
    let userDocToUse = customerDoc
    if (invitedByCustomerUserDoc && (invitedByCustomerUserDoc.memberType === 'business' ||
    invitedByCustomerUserDoc.memberType === 'agent')) {
      userDocToUse = invitedByCustomerUserDoc
    }
    const isNotaryUserLinked = await UserNotaryRelation.findOne({
      customerid: userDocToUse._id,
      notaryid: notaryUserId,
      relationType: 'invited',
      deleted: {$ne: true}
    })
    if (isNotaryUserLinked || (notaryUserDoc && notaryUserDoc.businessUserAllowedNotaryToInvite)) {
      const orQuery = []
      if (invitedByCustomerUserDoc && invitedByCustomerUserDoc._id) {
        // orQuery.push({
        //   userId: invitedByCustomerUserDoc._id
        // })
        orQuery.push({
          invitedByCustomer: invitedByCustomerUserDoc._id
        })
      }
      if (customerDoc && (customerDoc.memberType === 'business' || customerDoc.memberType === 'agent')) {
        orQuery.push({
          userId: customerDoc._id
        })
      }
      if (notaryUserDoc && notaryUserDoc.businessUserAllowedNotaryToInvite) {
        orQuery.push({
          notaryUserId: notaryUserDoc._id
        })
      }
      console.log('invitedByCustomerUserDoc', invitedByCustomerUserDoc)
      console.log('orQuery', orQuery)
      if (!orQuery.length) {
        return ''
      }
      const sessionsDoneInCurrentMonth = await NewSessionModel.count({
        $or: orQuery,
        status: 'complete',
        _id: {$ne: newSessionDoc._id},
        createdAt: {$gte: moment().startOf('month')}
      })
      console.log('sessionsDoneInCurrentMonth', sessionsDoneInCurrentMonth)
      if (sessionsDoneInCurrentMonth < 7) {
        return 'free'
      } else {
        return 'partial'
      }
    }
  }
  return ''
}

const processEVSCardAPI = async (typeOfPhotoId, frontImageData, backImageData,
                                 customerReferenceNumber, biometrics, res) => {
  const builder = new XMLBuilder();
  const frontImage = await sharp(Buffer.from(frontImageData, 'base64')).resize({ width: 1500 }).toBuffer();
  const finalFrontImageData = frontImage.toString('base64')
  let finalBackImageData;
  if (backImageData) {
    const backImage = await sharp(Buffer.from(backImageData, 'base64')).resize({ width: 1500 }).toBuffer();
    finalBackImageData = backImage.toString('base64')
  }
  let documentType = 'DriversLicense';
  if (typeOfPhotoId === 'passportbook') {
    documentType = 'PassportBook'
  }
  if (typeOfPhotoId === 'passportcard') {
    documentType = 'PassportCard'
  }

  const identityDoc = {
    ScanMode: 'DirectImageUpload',
    DocumentType: documentType,
    FrontImage: finalFrontImageData,
    BackImage: null,
    PortraitImage: null
  }
  if (finalBackImageData) {
    identityDoc.BackImage = finalBackImageData
  }
  if (biometrics) {
    identityDoc.PortraitImage = biometrics
  }
  const jsObjectToSend = {
    PlatformRequest: {
      Credentials: {
        Username: 'E27368-65DCF76C-B477-4167-83F4-2E63D0690D4C',
        Password: 'nN0Q44tYmykA5ib'
      },
      CustomerReference: customerReferenceNumber,
      Identity: identityDoc
    }
  }
  const xmlContent = builder.build(jsObjectToSend);
  const evsFillAPIUrl = 'https://identiflo.everification.net/WebServices/Integrated/Main/V220/Card'
  const headers = {'Content-Type': 'application/xml'}
  console.log(xmlContent)
  console.log(evsFillAPIUrl)
  console.log('jsObjectToSend', jsObjectToSend)
  request.post({url: evsFillAPIUrl, body: xmlContent, headers}, (error1, response1, body1) => {
    const parser = new XMLParser({
      attributeNamePrefix : '@_',
      ignoreAttributes : false,
      ignoreNameSpace: false,
      textNodeName : 'text'
    });
    const apiResponse = parser.parse(body1);
    console.log(util.inspect(apiResponse, {showHidden: false, depth: null, colors: true}))
    let apiStatus = 'Pass';
    let apiMessage = 'We are processing your Passport'
    let finalResponse
    const platformResponse = apiResponse && apiResponse.PlatformResponse || {}
    if (platformResponse && platformResponse.TransactionDetails && platformResponse.TransactionDetails.Errors &&
      platformResponse.TransactionDetails.Errors.Error &&
      platformResponse.TransactionDetails.Errors.Error['@_message']) {
      apiStatus = 'Fail'
      apiMessage = platformResponse.TransactionDetails.Errors.Error['@_message']
      finalResponse = {
        apiStatus,
        apiMessage
      }
      return res.status(200).json(finalResponse)
    }
    res.status(200).json(finalResponse)
  });
}
