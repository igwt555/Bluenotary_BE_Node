const nodemailer = require("nodemailer");
const locals = require("../../locales/en.json");
// const mg = require('nodemailer-mailgun-transport')
const ejs = require("ejs");
const path = require("path");
const moment = require("moment");
const User = require("../models/user");
const { itemAlreadyExists } = require("../middleware/utils");
var SibApiV3Sdk = require("sib-api-v3-sdk");
var defaultClient = SibApiV3Sdk.ApiClient.instance;
var apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = process.env.SENDBLUE_KEY;
var apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
var sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail(); // SendSmtpEmail | Values to send a transactional email

/**
 * Sends email
 * @param {Object} data - data
 * @param {boolean} callback - callback
 */
const sendVerifyEmail = async (data, callback) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  transporter.verify((error) => {
    if (error) {
      console.log(error);
    } else {
      console.log(`Server is ready to take our messages to ${data.user.email}`);
    }
  });

  const templateHtml = await ejs.renderFile(
    path.join(__dirname, "../../templates/verify.ejs"),
    {
      token: `${process.env.API_URL}/verify?verification=${data.user.verification}`,
    },
  );
  const mailOptions = {
    from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM_ADDRESS}>`,
    to: `<${data.user.email}>`,
    subject: data.subject,
    html: templateHtml,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return callback(false);
    }
    return callback(true);
  });
};

const sendResetPassEmail = async (data, callback) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  transporter.verify((error) => {
    if (error) {
      console.log(error);
    } else {
      console.log(`Server is ready to take our messages to ${data.user.email}`);
    }
  });

  const templateHtml = await ejs.renderFile(
    path.join(__dirname, "../../templates/resetPass.ejs"),
    {
      token: `${process.env.FRONT_URL}/auth/reset-password/${data.user.verification}`,
    },
  );
  const mailOptions = {
    from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM_ADDRESS}>`,
    to: `<${data.user.email}>`,
    subject: data.subject,
    html: templateHtml,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return callback(false);
    }
    return callback(true);
  });
};

/**
 * Prepares to send email
 * @param {string} user - user object
 * @param {string} subject - subject
 * @param {string} htmlMessage - html message
 */
const prepareToSendVerifyEmail = (user, subject, htmlMessage) => {
  user = {
    email: user.email,
    verification: user.verification,
  };
  const data = {
    user,
    subject,
    htmlMessage,
  };
  if (process.env.NODE_ENV === "production") {
    sendVerifyEmail(data, (messageSent) =>
      messageSent
        ? console.log(`Email SENT to: ${user.email}`)
        : console.log(`Email FAILED to: ${user.email}`),
    );
  } else if (process.env.NODE_ENV === "development") {
    sendVerifyEmail(data, (messageSent) =>
      messageSent
        ? console.log(`Email SENT to: ${user.email}`)
        : console.log(`Email FAILED to: ${user.email}`),
    );
  }
};

const prepareToSendResetEmail = (user, subject, htmlMessage) => {
  user = {
    email: user.email,
    verification: user.verification,
  };
  const data = {
    user,
    subject,
    htmlMessage,
  };
  if (process.env.NODE_ENV === "production") {
    sendResetPassEmail(data, (messageSent) =>
      messageSent
        ? console.log(`Email SENT to: ${user.email}`)
        : console.log(`Email FAILED to: ${user.email}`),
    );
  } else if (process.env.NODE_ENV === "development") {
    sendResetPassEmail(data, (messageSent) =>
      messageSent
        ? console.log(`Email SENT to: ${user.email}`)
        : console.log(`Email FAILED to: ${user.email}`),
    );
  }
};

module.exports = {
  /**
   * Checks User model if user with an specific email exists
   * @param {string} email - user email
   */
  async emailExists(email) {
    return new Promise((resolve, reject) => {
      User.findOne(
        {
          email,
        },
        (err, item) => {
          itemAlreadyExists(err, item, reject, "EMAIL_ALREADY_EXISTS");
          resolve(false);
        },
      );
    });
  },

  /**
   * Checks User model if user with an specific email exists but excluding user id
   * @param {string} id - user id
   * @param {string} email - user email
   */
  async emailExistsExcludingMyself(id, email) {
    return new Promise((resolve, reject) => {
      User.findOne(
        {
          email,
          _id: {
            $ne: id,
          },
        },
        (err, item) => {
          itemAlreadyExists(err, item, reject, "EMAIL_ALREADY_EXISTS");
          resolve(false);
        },
      );
    });
  },

  /**
   * Sends registration email
   * @param {Object} user - user object
   */
  async sendRegistrationEmailMessage(user) {
    const templateID = (user.role === "notary") ? 8 : 1;
    const subject = locals.registration.SUBJECT;
    const htmlMessage = `${locals.registration.MESSAGE}
      ${process.env.API_URL}${user.verification}`;

    console.log(`${process.env.API_URL}${user.verification}`);
    const sendData = {
      to: [
        {
          email: user.email,
          name: user.name,
        },
      ],
      templateId: templateID,
      params: {
        userName: user.name,
        activateUrl: `${process.env.API_URL}/api/auth/verify?verification=${user.verification}`,
      },
    };

    apiInstance.sendTransacEmail(sendData).then(
      function(data) {
        console.log("API called successfully. Returned data: ", data);
      },
      function(error) {
        console.error(error);
      },
    );
    // prepareToSendVerifyEmail(user, subject, htmlMessage);
  },

  async sendNotaryApprovalEmailMessage(user) {
    const sendData = {
      to: [
        {
          email: user.email,
          name: user.name,
        },
      ],
      templateId: 9,
    };

    apiInstance.sendTransacEmail(sendData).then(
      function(data) {
        console.log("API called successfully. Returned data: ", data);
      },
      function(error) {
        console.error(error);
      },
    );
  },

  async sendCommissionExpiredEmailMessage(user) {
    const sendData = {
      to: [
        {
          email: user.email,
          name: user.name,
        },
      ],
      templateId: 10,
    };

    apiInstance.sendTransacEmail(sendData).then(
      function(data) {
        console.log("API called successfully. Returned data: ", data);
      },
      function(error) {
        console.error(error);
      },
    );
  },

  async sendRegistratedEmail(user) {
    var sendData = {
      to: [
        {
          email: user.email,
          name: user.name,
        },
      ],
      templateId: 4,
    };

    apiInstance.sendTransacEmail(sendData).then(
      function(data) {
        console.log("API called successfully. Returned data: ", data);
      },
      function(error) {
        console.error(error);
      },
    );
    // prepareToSendVerifyEmail(user, subject, htmlMessage);
  },
  /**
   * Sends reset password email
   * @param {string} locale - locale
   * @param {Object} user - user object
   */
  async sendResetPasswordEmailMessage(user) {
    const sendData = {
      to: [
        {
          email: user.email,
          name: user.name,
        },
      ],
      templateId: 2,
      params: {
        forgotUrl: `${process.env.FRONT_URL}/reset-password/${user.verification}`,
      },
    };

    apiInstance.sendTransacEmail(sendData).then(
      function(data) {
        console.log("API called successfully. Returned data: ", data);
      },
      function(error) {
        console.error(error);
      },
    );

    // prepareToSendResetEmail(user, subject, htmlMessage);
  },

  // notary signer invite email
  async sendNotarySignerEmail(user, notaryUser , password, meetingdate, sessionID, meetingTimeZone, dontSendTempPassword) {

    let actualTimezone = "Central";
    if (meetingTimeZone === "5.5") {
      actualTimezone = "GMT+05:30";
    } else if (meetingTimeZone === "-10") {
      actualTimezone = "Hawaii";
    } else if (meetingTimeZone === "-8") {
      actualTimezone = "Alaska";
    } else if (meetingTimeZone === "-7") {
      actualTimezone = "Pacific";
    } else if (meetingTimeZone === "-6") {
      actualTimezone = "Central";
    } else if (meetingTimeZone === "-5") {
      actualTimezone = "Eastern Time";
    } else if (meetingTimeZone === "-4") {
      actualTimezone = "Atlantic";
    } else {
      actualTimezone = "Central";
    }
    let meetingDateFormatted = "";
    let preDateText = "";
    let userName = user.name;
    let passwordToSend = password;
    if (dontSendTempPassword) {
      passwordToSend = "";
    }
    const templateID = (passwordToSend === "") ? 3 : 4;
    if (meetingdate) {
      preDateText = "Your meeting with the notary is scheduled for ";
      if (templateID === 4) {
        preDateText = "Your meeting is scheduled for ";
      }
      //meetingDateFormatted = moment(meetingdate).utcOffset("-06:00").format("MMMM, Do YYYY") + " at " + moment(meetingdate).utcOffset("-06:00").format("hh:mmA") + " CST";
      meetingDateFormatted = moment(meetingdate).format("MMMM, Do YYYY") + " at " + moment(meetingdate).format("hh:mmA") + " " + actualTimezone;
    }
    let emailCustomMessage = "You've been invited to a notarization session using the BlueNotary platform.";
    let emailLogoUrl = "https://img.mailinblue.com/4452360/images/content_library/original/626215907bdc8059ca08a677.png";
    if (notaryUser && notaryUser.memberType === "pro") {
      if (notaryUser.sendBrandEmails && notaryUser.sendBrandEmails === true ) {
        if (notaryUser.emailCustomMessage) {
          emailCustomMessage = notaryUser.emailCustomMessage;
        }
        if (notaryUser.emailLogoUrl) {
          emailLogoUrl = notaryUser.emailLogoUrl;
        }
      }
    }
    const sendData = {
      to: [{
        email: user.email,
        name: user.name,
      }],
      templateId: templateID,
      params: {
        preDateText,
        meetingdate: meetingDateFormatted,
        password: passwordToSend,
        inviteLink: `${process.env.FRONT_URL}/sign-mail/sign-in?type=customer&email=${user.email}&password=${password}&loginViaEmail=true&sessionid=${sessionID}&routetype=prepareDoc&autosubmit=true`,
        userName,
        emailCustomMessage,
        emailLogoUrl,
      },
    };
    console.log("sendData", sendData);
    apiInstance.sendTransacEmail(sendData).then(
      function(data) {
        console.log("sendNotarySignerEmail API called successfully. Returned data: ", data);
      },
      function(error) {
        console.error(error);
      },
    );
  },

  // notary signer session reminder email
  async sendSessionReminderEmails(userdoc, meetingdate, sessionID) {
    console.log("meetingDate ", meetingdate);
    const templateID = 18;
    const meetingDateFormatted = moment(meetingdate).utcOffset("-06:00").format("MMMM, Do YYYY") + " at " + moment(meetingdate).utcOffset("-06:00").format("hh:mmA") + " CST";
    const preDateText = "Notary Session ID is " + sessionID + " and Session Time is";
    const sendData = {
      to: [{
        email: userdoc.email,
        name: userdoc.name,
      }],
      templateId: templateID,
      params: {
        userName: userdoc.name,
        preDateText,
        meetingdate: meetingDateFormatted,
        sessionid: sessionID,
        // inviteLink: `${process.env.FRONT_URL}/sign-in?type=customer&email=${user.email}&password=${password}&loginViaEmail=true&sessionid=${sessionID}&routetype=prepareDoc&autosubmit=true`,
      },
    };
    apiInstance.sendTransacEmail(sendData).then(
      function(data) {
        console.log("sendNotarySignerEmail API called successfully. Returned data: ", data);
      },
      function(error) {
        console.error(error);
      },
    );
  },
  // notary signer session due email
  async sendSessionDueEmails(userdoc, meetingdate, sessionID) {
    console.log("meetingDate ", meetingdate);
    const templateID = 22;
    const meetingDateFormatted = moment(meetingdate).utcOffset("-06:00").format("MMMM, Do YYYY") + " at " + moment(meetingdate).utcOffset("-06:00").format("hh:mmA") + " CST";
    const preDateText = "Notary Session ID is " + sessionID + " and Session Time is";
    const sendData = {
      to: [{
        email: userdoc.email,
        name: userdoc.name,
      }],
      templateId: templateID,
      params: {
        userName: userdoc.name,
        preDateText,
        meetingdate: meetingDateFormatted,
        sessionid: sessionID,
        // inviteLink: `${process.env.FRONT_URL}/sign-in?type=customer&email=${user.email}&password=${password}&loginViaEmail=true&sessionid=${sessionID}&routetype=prepareDoc&autosubmit=true`,
      },
    };
    apiInstance.sendTransacEmail(sendData).then(
      function(data) {
        console.log("sendSessionDueEmails API called successfully. Returned data: ", data);
      },
      function(error) {
        console.error(error);
      },
    );
  },
  // customer email sent when notary picks a session
  async sendEmailToCustomerRegardingSessionPicked(userdoc, meetingdate, sessionID) {
    console.log("meetingDate ", meetingdate);
    const templateID = 19;
    const meetingDateFormatted = moment(meetingdate).utcOffset("-06:00").format("MMMM, Do YYYY") + " at " + moment(meetingdate).utcOffset("-06:00").format("hh:mmA") + " CST";
    const preDateText = "Notary Session ID is " + sessionID + " and Session Time is";
    const sendData = {
      to: [{
        email: userdoc.email,
        name: userdoc.name,
      }],
      templateId: templateID,
      params: {
        preDateText,
        userName: userdoc.name,
        meetingdate: meetingDateFormatted,
        sessionid: sessionID,
        // inviteLink: `${process.env.FRONT_URL}/sign-in?type=customer&email=${user.email}&password=${password}&loginViaEmail=true&sessionid=${sessionID}&routetype=prepareDoc&autosubmit=true`,
      },
    };
    console.log(sendData);
    apiInstance.sendTransacEmail(sendData).then(
      function(data) {
        console.log("sendNotarySignerEmail API called successfully. Returned data: ", data);
      },
      function(error) {
        console.error(error);
      },
    );
  },

  // send email to Selected Notary about the session
  async sendEmailToSelectedNotary(sessionId, notaryId, fullSessionId) {
    // find notary
    const notary = await User.findOne({_id: notaryId});
    // notary exists, verified and approved
    if (notary && notary.verified && notary.approve !== "inactive") {
      const sendData = {
        to: [{
          email: notary.email,
          name: notary.name,
        }],
        templateId: 6,
        params: {
          userName: notary.name,
          sessionId,
          // dashboardLink: `${process.env.FRONT_URL}/notary/dashboard/`,
          dashboardLink: `${process.env.FRONT_URL}/sign-mail/sign-in?type=notary&email=${notary.email}&password=${notary.password}&loginViaEmail=true&sessionid=${fullSessionId}&routetype=pdfEdit&autosubmit=true`,
        },
      };

      apiInstance.sendTransacEmail(sendData).then(
        function(data) {
          console.log("Assigned Notary Alert API called successfully. Returned data: ", data);
        },
        function(error) {
          console.error(error);
        },
      );
    }
  },

  // send email to All Notaries about the session
  async sendEmailToAllNotaries(sessionId, sessionDoc, identityModelData) {
    let notaries;
    if (sessionDoc?.typeOfKBA === "foreigners_without_residential" && identityModelData?.typeOfPhotoId === "passportbook") {
      notaries = await User.find({
        role: "notary",
        verified: true,
        memberType: "pro",
        approve: {"$ne": "inactive"},
        state: {"$in": ["Florida", "Virginia"]},
      });
    } else {
      notaries = await User.find({
        role: "notary",
        verified: true,
        memberType: "pro",
        approve: {"$ne": "inactive"},
      });
    }
    let emailData = [];
    if (notaries) {
      notaries.forEach(notary => {
        // send email if notary is active and a pro member
        emailData.push({
          email: notary.email,
          name: notary.name,
        });
      });
    }
    console.log("emailData", emailData);
    if (emailData && emailData.length) {
      const sendData = {
        to: [
          {
            "email": "info@bluenotary.us",
            "name": "Blue Notary",
          },
        ],
        bcc: emailData,
        templateId: 7,
        params: {
          sessionId,
          dashboardLink: `${process.env.FRONT_URL}/notary/dashboard/`,
        },
      };
      console.log("sendData OPEN CALL", sendData);
      apiInstance.sendTransacEmail(sendData).then(
        function(data) {
          console.log("Unassigned Open Call API called successfully. Returned data: ", data);
        },
        function(error) {
          console.error(error);
        },
      );
    }
  },

  // send email to Witness when invited to a session
  async sendEmailToWitnessWhenInvitedToSession(user, password, meetingdate, sessionID) {
    console.log("meetingDate ", meetingdate);
    const templateID = 11;
    let meetingDateFormatted = "";
    if (meetingdate) {
      meetingDateFormatted = moment(meetingdate).utcOffset("-06:00").format("MMMM, Do YYYY") + " at " + moment(meetingdate).utcOffset("-06:00").format("hh:mmA") + " CST";
    }
    const finalEmail = user.realEmail || user.email;
    const sendData = {
      to: [{
        email: finalEmail,
        name: user.name,
      }],
      templateId: templateID,
      params: {
        userName: user.name,
        meetingdate: meetingDateFormatted,
        password: password,
        inviteLink: `${process.env.FRONT_URL}/sign-mail/sign-in?type=witness&email=${user.email}&password=${password}&temporary=true&sessionid=${sessionID}&autosubmit=true`,
      },
    };
    apiInstance.sendTransacEmail(sendData).then(
      function(data) {
        console.log("sendNotarySignerEmail API called successfully. Returned data: ", data);
      },
      function(error) {
        console.error(error);
      },
    );
  },

  // send email to Additional Signer when invited to a session
  async sendEmailToAdditionalSignerWhenInvitedToSession(user, password, meetingDateFormatted, sessionID) {
    console.log("meetingDate ", meetingDateFormatted);
    const templateID = 21;
    const finalEmail = user.realEmail || user.email;
    const sendData = {
      to: [{
        email: finalEmail,
        name: user.name,
      }],
      templateId: templateID,
      params: {
        emailCustomMessage: "You've been invited as Additional Signer a notarization session using BlueNotary platform.",
        preDateText: "Your meeting with the notary is scheduled for ",
        userName: user.name,
        meetingdate: meetingDateFormatted,
        password: password,
        inviteLink: `${process.env.FRONT_URL}/sign-mail/sign-in?type=customer&email=${user.email}&password=${password}&loginViaEmail=true&routetype=businessKBA&sessionid=${sessionID}&autosubmit=true`,
      },
    };
    apiInstance.sendTransacEmail(sendData).then(
      function(data) {
        console.log("sendNotarySignerEmail API called successfully. Returned data: ", data);
      },
      function(error) {
        console.error(error);
      },
    );
  },

  // send email to Notary when invited in some Business Customer Account
  async sendEmailToNotaryWhenInvitedByBusinessCustomer(user, password, customerUser) {
    const templateID = 26;
    const finalEmail = user.realEmail || user.email;
    const sendData = {
      to: [{
        email: finalEmail,
        name: user.name,
      }],
      templateId: templateID,
      params: {
        userName: user.name,
        inviteLink: `${process.env.FRONT_URL}/sign-mail/sign-in?type=notary&email=${user.email}&password=${password}&loginViaEmail=true&routetype=settings&autosubmit=true`,
      },
    };
    apiInstance.sendTransacEmail(sendData).then(
      function(data) {
        console.log("sendNotarySignerEmail API called successfully. Returned data: ", data);
      },
      function(error) {
        console.error(error);
      },
    );
  },

  //send mail to customer when session is completed
  async sendMailWhenSessionIsCompleted(sessionid, username, useremail) {
    const templateID = 27;
    const sendData = {
      to: [{
        email: useremail,
        name: username,
      }],
      templateId: templateID,
      params: {
        userName: username,
        redirectUrl: "https://app.bluenotary.us/sign-in?type=customer&routetype=businessConfirmation&sessionid=" + sessionid,
      },
    };
    apiInstance.sendTransacEmail(sendData).then(
      function(data) {
        console.log("sendMailWhenSessionIsCompleted API called successfully. Returned data: ", data);
      },
      function(error) {
        console.error(error);
      },
    );
  },
};
