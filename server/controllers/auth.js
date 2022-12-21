/* eslint-disable */
import { NotaryDataModel } from "../models/notarydata";
import aws from "aws-sdk";
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const UserAccess = require("../models/userAccess");
const ForgotPassword = require("../models/forgotPassword");
const utils = require("../middleware/utils");
const uuid = require("uuid");
const { addHours } = require("date-fns");
const { matchedData } = require("express-validator");
// const stripe = require("../stripe");
const auth = require("../middleware/auth");
const emailer = require("../middleware/emailer");
const { exists } = require("../models/user");
const fs = require("fs");
const HOURS_TO_BLOCK = 2;
const LOGIN_ATTEMPTS = 5;
aws.config.update({
  apiVersion: "2006-03-01",
  accessKeyId: process.env.AWSAccessKeyId,
  secretAccessKey: process.env.AWSSecretKey,
  region: process.env.AWSRegion,
});
const s3 = new aws.S3();

/*********************
 * Private functions *
 *********************/

/**
 * Generates a token
 * @param {Object} user - user object
 */
const generateToken = (user) => {
  // Gets expiration time
  const expiration =
    Math.floor(Date.now() / 1000) + 60 * process.env.JWT_EXPIRATION_IN_MINUTES;

  // returns signed and encrypted token
  return auth.encrypt(
    jwt.sign(
      {
        data: {
          _id: user,
        },
        exp: expiration,
      },
      process.env.JWT_SECRET,
    ),
  );
};

/**
 * Creates an object with user info
 * @param {Object} req - request object
 */
const setUserInfo = (req) => {
  let user = {
    _id: req._id,
    email: req.email,
    role: req.role,
    verified: req.verified,
    name: req.name,
  };
  // Adds verification for testing purposes
  if (process.env.NODE_ENV !== "production") {
    user = {
      ...user,
      verification: req.verification,
    };
  }
  return user;
};

/**
 * Saves a new user access and then returns token
 * @param {Object} req - request object
 * @param {Object} user - user object
 */
const saveUserAccessAndReturnToken = async (req, user) => {
  return new Promise((resolve, reject) => {
    const userAccess = new UserAccess({
      email: user.email,
      ip: utils.getIP(req),
      browser: utils.getBrowserInfo(req),
      country: utils.getCountry(req),
    });
    userAccess.save((err) => {
      if (err) {
        reject(utils.buildErrObject(422, err.message));
      }
      const userInfo = setUserInfo(user);
      // Returns data with access token
      resolve({
        token: generateToken(user._id),
        user: userInfo,
      });
    });
  });
};

/**
 * Blocks a user by setting blockExpires to the specified date based on constant HOURS_TO_BLOCK
 * @param {Object} user - user object
 */
const blockUser = async (user) => {
  return new Promise((resolve, reject) => {
    user.blockExpires = addHours(new Date(), HOURS_TO_BLOCK);
    user.save((err, result) => {
      if (err) {
        reject(utils.buildErrObject(422, err.message));
      }
      if (result) {
        resolve(utils.buildErrObject(409, "BLOCKED_USER"));
      }
    });
  });
};

/**
 * Saves login attempts to dabatabse
 * @param {Object} user - user object
 */
const saveLoginAttemptsToDB = async (user) => {
  return new Promise((resolve, reject) => {
    user.save((err, result) => {
      if (err) {
        reject(utils.buildErrObject(422, err.message));
      }
      if (result) {
        resolve(true);
      }
    });
  });
};

/**
 * Checks that login attempts are greater than specified in constant and also that blockexpires is less than now
 * @param {Object} user - user object
 */
const blockIsExpired = (user) =>
  user.loginAttempts > LOGIN_ATTEMPTS && user.blockExpires <= new Date();

/**
 *
 * @param {Object} user - user object.
 */
const checkLoginAttemptsAndBlockExpires = async (user) => {
  return new Promise((resolve, reject) => {
    // Let user try to login again after blockexpires, resets user loginAttempts
    if (blockIsExpired(user)) {
      user.loginAttempts = 0;
      user.save((err, result) => {
        if (err) {
          reject(utils.buildErrObject(422, err.message));
        }
        if (result) {
          resolve(true);
        }
      });
    } else {
      // User is not blocked, check password (normal behaviour)
      resolve(true);
    }
  });
};

/**
 * Checks if blockExpires from user is greater than now
 * @param {Object} user - user object
 */
const userIsBlocked = async (user) => {
  return new Promise((resolve, reject) => {
    if (user.blockExpires > new Date()) {
      reject(utils.buildErrObject(409, "BLOCKED USER"));
    }
    resolve(true);
  });
};

/**
 * Finds user by email
 * @param {string} email - user´s email
 */
const findUser = async (email, nonstrictCheckingOfEmail) => {
  return new Promise((resolve, reject) => {
    User.findOne(
      {
        email,
      },
      "password loginAttempts blockExpires name email role verified verification temporary realEmail, approve",
      (err, item) => {
        if (!nonstrictCheckingOfEmail) {
          utils.itemNotFound(err, item, reject, "USER DOES NOT EXIST");
        }
        console.log("item", item);
        resolve(item);
      },
    );
  });
};

/**
 * Finds user by ID
 * @param {string} id - user´s id
 */
const findUserById = async (userId) => {
  return new Promise((resolve, reject) => {
    User.findById(userId, (err, item) => {
      utils.itemNotFound(err, item, reject, "USER DOES NOT EXIST");
      resolve(item);
    });
  });
};

/**
 * Adds one attempt to loginAttempts,
 * then compares loginAttempts with the constant LOGIN_ATTEMPTS,
 *  if is less returns wrong password, else returns blockUser function
 * @param {Object} user - user object
 */
const passwordsDoNotMatch = async (user) => {
  user.loginAttempts += 1;
  await saveLoginAttemptsToDB(user);
  return new Promise((resolve, reject) => {
    if (user.loginAttempts <= LOGIN_ATTEMPTS) {
      resolve(utils.buildErrObject(409, "WRONG PASSWORD"));
    } else {
      resolve(blockUser(user));
    }
    reject(utils.buildErrObject(422, "ERROR"));
  });
};

/**
 * Registers a new user in database
 * @param {Object} req - request object
 */
const registerUser = async (
  req,
) => {
  return new Promise((resolve, reject) => {
    const user = new User({
      first_name: req.first_name,
      last_name: req.last_name,
      name: req.name,
      email: req.email,
      password: req.password,
      verification: uuid.v4(),
      role: req.role,
      hearaboutdata: req.hearaboutdata,
      commissionNumber: req.commissionNumber,
      state: req.state,
      approve: (req.role === "notary") ? "inactive" : "active",
    });
    user.save((err, item) => {
      if (err) {
        reject(utils.buildErrObject(422, err.message));
      }
      resolve(item);
    });
  });
};

/**
 * Builds the registration token
 * @param {Object} item - user object that contains created id
 * @param {Object} userInfo - user object
 */
const returnRegisterToken = (item, userInfo) => {
  if (process.env.NODE_ENV !== "production") {
    userInfo.verification = item.verification;
  }
  const data = {
    success: true,
    // token: generateToken(item._id),
    message: "Your account has been created successfully, please verify your email address to continue.",
  };
  return data;
};

/**
 * Checks if verification id exists for user
 * @param {string} verification - verification id
 */
const verificationExists = async (verification) => {
  return new Promise((resolve, reject) => {
    User.findOne(
      {
        verification,
        verified: false,
      },
      (err, user) => {
        utils.itemNotFound(err, user, reject, "NOT_FOUND_OR_ALREADY_VERIFIED");
        resolve(user);
      },
    );
  });
};

/**
 * Verifies an user
 * @param {Object} user - user object
 */
const verifyUser = async (user) => {
  return new Promise((resolve, reject) => {
    user.verified = true;
    user.save((err, item) => {
      if (err) {
        reject(utils.buildErrObject(422, err.message));
      }
      resolve({
        email: item.email,
        verified: item.verified,
      });
    });
  });
};

/**
 * Marks a request to reset password as used
 * @param {Object} req - request object
 * @param {Object} forgot - forgot object
 */
const markResetPasswordAsUsed = async (req, forgot) => {
  return new Promise((resolve, reject) => {
    forgot.used = true;
    forgot.ipChanged = utils.getIP(req);
    forgot.browserChanged = utils.getBrowserInfo(req);
    forgot.countryChanged = utils.getCountry(req);
    forgot.save((err, item) => {
      utils.itemNotFound(err, item, reject, "NOT_FOUND");
      resolve(utils.buildSuccObject("PASSWORD CHANGED"));
    });
  });
};

/**
 * Updates a user password in database
 * @param {string} password - new password
 * @param {Object} user - user object
 */
const updatePassword = async (password, user) => {
  return new Promise((resolve, reject) => {
    user.password = password;
    user.save((err, item) => {
      utils.itemNotFound(err, item, reject, "NOT FOUND");
      resolve(item);
    });
  });
};

/**
 * Finds user by email to reset password
 * @param {string} email - user email
 */
const findUserToResetPassword = async (email) => {
  return new Promise((resolve, reject) => {
    User.findOne(
      {
        email,
      },
      (err, user) => {
        utils.itemNotFound(err, user, reject, "NOT FOUND");
        resolve(user);
      },
    );
  });
};

/**
 * Checks if a forgot password verification exists
 * @param {string} id - verification id
 */
const findForgotPassword = async (id) => {
  return new Promise((resolve, reject) => {
    ForgotPassword.findOne(
      {
        verification: id,
        used: false,
      },
      (err, item) => {
        utils.itemNotFound(err, item, reject, "NOT_FOUND_OR_ALREADY_USED");
        resolve(item);
      },
    );
  });
};

/**
 * Creates a new password forgot
 * @param {Object} req - request object
 */
const saveForgotPassword = async (req) => {
  return new Promise((resolve, reject) => {
    const forgot = new ForgotPassword({
      email: req.body.email,
      verification: uuid.v4(),
      ipRequest: utils.getIP(req),
      browserRequest: utils.getBrowserInfo(req),
      countryRequest: utils.getCountry(req),
    });
    forgot.save((err, item) => {
      if (err) {
        reject(utils.buildErrObject(422, err.message));
      }
      resolve(item);
    });
  });
};

/**
 * Builds an object with created forgot password object, if env is development or testing exposes the verification
 * @param {Object} item - created forgot password object
 */
const forgotPasswordResponse = (item) => {
  let data = {
    msg: "We have sent you an email with instructions to reset your password.",
    email: item.email,
  };
  if (process.env.NODE_ENV !== "production") {
    data = {
      ...data,
      verification: item.verification,
    };
  }
  return data;
};

/**
 * Checks against user if has quested role
 * @param {Object} data - data object
 * @param {*} next - next callback
 */
const checkPermissions = async (data, next) => {
  return new Promise((resolve, reject) => {
    console.log("data", data);
    User.findById(data.id, (err, result) => {
      utils.itemNotFound(err, result, reject, "NOT_FOUND");
      if (data.roles.indexOf(result.role) > -1 && result.verified) {
        return resolve(next());
      }
      return reject(utils.buildErrObject(401, "UNAUTHORIZED"));
    });
  });
};

const generateNotarySeal = async (req) => {
  let sealData;
  const {spawn} = require("child_process");
  var path = require("path");
  console.log(req);
  var template = path.resolve("./public/templates/" + req.state + ".jpg");
  if (!fs.existsSync(template)) {
    return false;
  }
  const python = spawn("python3", [path.resolve("./scripts/alter_seal_template.py"), req.state, req.name, req.commissionNumber, req.commissionExpiresOn, template]);
  await new Promise( (resolve) => {
    python.on("close", resolve);
  });
  var sealFile = path.resolve("./public/templates/seal-" + req.commissionNumber + ".jpg");
  if (fs.existsSync(sealFile)) {
    var fileContent = fs.readFileSync(sealFile);
    const params = {
      Bucket: process.env.AWSBucket,
      Key: Date.now().toString() + "seal-" + req.commissionNumber + ".jpg",
      Body: fileContent,
      ACL: "public-read",
    };
    try {
      sealData = await s3.upload(params).promise();
      fs.unlinkSync(sealFile);
      return sealData;
    } catch (err) {
      console.log(err);
    }
  }
  return false;
};

/**
 * Gets user id from token
 * @param {string} token - Encrypted and encoded token
 */
exports.getUserIdFromToken = async (token) => {
  return new Promise((resolve, reject) => {
    // Decrypts, verifies and decode token
    jwt.verify(auth.decrypt(token), process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        reject(utils.buildErrObject(409, "BAD_TOKEN"));
      }
      resolve(decoded.data._id);
    });
  });
};

/********************
 * Public functions *
 ********************/

/**
 * Login function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
exports.login = async (req, res) => {
  try {
    const data = matchedData(req);
    console.log("---login---", data);
    let nonstrictCheckingOfEmail = false;
    if (data.loginViaSales === "true") {
      nonstrictCheckingOfEmail = true;
    }
    let user = await findUser(data.email, nonstrictCheckingOfEmail);

    if (data.loginViaSales === "true") {
      if (!user) {
        user = new User({
          name: "Basic Customer",
          first_name: "Basic",
          last_name: "Customer",
          email: data.email,
          password: data.password || utils.generateRandomPassword(6),
          verification: uuid.v4(),
          role: "customer",
          memberType: "free",
          updateUserNameOnFirstSession: true,
          needToUpdatePasswordInSession: true,
          state: "",
          verified: true,
        });
        await user.save();
      }
    }

    // await userIsBlocked(user);
    // await checkLoginAttemptsAndBlockExpires(user);
    if (user && !user.verified) {
      return res.status(200).json({ message: "Please verify your email address.", resendVerifyEmail: true });
    }

    // console.log(user.role, user.approve);
    // console.log(user);
    // if (user && user.role === "notary" && user.approve === "inactive") {
    //   return utils.handleError(res, { message: "Your account is not approved yet, please ask administrator to approve it." });
    // }

    let isPasswordMatch = await auth.checkPassword(data.password, user);
    if (data.temporary === "true" && user.temporary) {
      if (data.password === user.password) {
        isPasswordMatch = true;
      }
    }
    if (data.impersonate === "true" || data.loginViaEmail === "true") {
      if (data.password === user.password) {
        isPasswordMatch = true;
      }
    }
    if (!isPasswordMatch) {
      utils.handleError(res, await passwordsDoNotMatch(user));
    } else {
      // all ok, register access and return token
      user.loginAttempts = 0;
      await saveLoginAttemptsToDB(user);
      res.status(200).json(await saveUserAccessAndReturnToken(req, user));
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};

/**
 * Register function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
exports.register = async (req, res) => {
  try {
    // Gets locale from header 'Accept-Language'
    const promoCode = req.body.promoCode;
    req = matchedData(req);
    console.log("register", req);
    const doesEmailExists = await emailer.emailExists(req.email);
    if (!doesEmailExists) {
      const item = await registerUser(
        req,
      );
      if (req.role === "notary") {
        const sealData = await generateNotarySeal(req);
        if (sealData) {
          const newProxy = new NotaryDataModel({
            commissionExpiresOn: req.commissionExpiresOn,
            sealdata: sealData.Location,
            sealfilename: sealData.key,
            userId: item._id,
            email: item.email,
            hearaboutdata: req.hearaboutdata,
          });
          await newProxy.save();
        } else {
          const newProxy = new NotaryDataModel({
            commissionExpiresOn: req.commissionExpiresOn,
            userId: item._id,
            email: item.email,
            hearaboutdata: req.hearaboutdata,
          });
          await newProxy.save();
        }
      }
      const userInfo = setUserInfo(item);
      const response = returnRegisterToken(item, userInfo);
      emailer.sendRegistrationEmailMessage(item);
      res.status(200).json(response);
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};
/**
 * Verify function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
exports.verify = async (req, res) => {
  try {
    req = matchedData(req);
    const { verification } = req;
    const user = await verificationExists(verification);
    await verifyUser(user);
    // emailer.sendRegistratedEmail(user);

    res.redirect(`${process.env.FRONT_URL}/sign-in`);
  } catch (error) {
    console.log(error);
    res.redirect(`${process.env.FRONT_URL}/verified`);

    // utils.handleError(res, error);
  }
};

/**
 * Verify function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
exports.reverify = async (req, res) => {
  // Gets locale from header 'Accept-Language'
  try {
    emailer.sendRegistrationEmailMessage(req.user);
    res.status(201).json({
      msg: `Verification email has been sent to ${req.user.email}`,
    });
  } catch (error) {
    utils.handleError(res, error);
  }
};

/**
 * Forgot password function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
exports.forgotPassword = async (req, res) => {
  try {
    // Gets locale from header 'Accept-Language'
    const data = matchedData(req);
    await findUser(data.email, false);
    const item = await saveForgotPassword(req);
    emailer.sendResetPasswordEmailMessage(item);
    res.status(200).json(forgotPasswordResponse(item));
  } catch (error) {
    utils.handleError(res, error);
  }
};

/**
 * Resend Verification Email
 */
exports.resendVerifyEmail = async (req, res) => {
  try {
    req = matchedData(req);
    let user = await User.findOne({email: req.email});
    if (!user) {
      // No email matched,
      return res.status(200).json({status: false, message: "Email does not exists, please check your email and try again."});
    }
    user.verification = uuid.v4();
    await user.save();
    emailer.sendRegistrationEmailMessage(user);
    res.status(200).json({status: true, message: "Verification email sent successfully."});
  } catch (error) {
    utils.handleError(res, error);
  }
};

/**
 * Reset password function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
exports.resetPassword = async (req, res) => {
  try {
    const data = matchedData(req);
    const forgotPassword = await findForgotPassword(data.id);
    const user = await findUserToResetPassword(forgotPassword.email);
    await updatePassword(data.password, user);
    const result = await markResetPasswordAsUsed(req, forgotPassword);
    res.status(200).json(result);
  } catch (error) {
    utils.handleError(res, error);
  }
};

/**
 * Refresh token function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
exports.getRefreshToken = async (req, res) => {
  try {
    const tokenEncrypted = req.headers.authorization
      .replace("Bearer ", "")
      .trim();
    let userId = await getUserIdFromToken(tokenEncrypted);
    console.log("getRefreshToken:", userId);
    userId = await utils.isIDGood(userId);
    const user = await findUserById(userId);
    const token = await saveUserAccessAndReturnToken(req, user);
    // Removes user info from response
    delete token.user;
    res.status(200).json(token);
  } catch (error) {
    utils.handleError(res, error);
  }
};

/**
 * Roles authorization function called by route
 * @param {Array} roles - roles specified on the route
 */
exports.roleAuthorization = (roles) => async (req, res, next) => {
  try {
    const data = {
      id: req.user._id,
      roles,
    };
    await checkPermissions(data, next);
  } catch (error) {
    utils.handleError(res, error);
  }
};

/**
 * Roles authorization function called by route
 * @param {Array} roles - roles specified on the route
 */
exports.checkSubscribed = () => async (req, res, next) => {
  try {
    const id = req.user._id;
    const { isSubscribed } = await User.findById(id);
    if (!isSubscribed) {
      throw {
        code: 401,
        message: "unsubscribed",
      };
    }
    next();
  } catch (error) {
    utils.handleError(res, error);
  }
};
/**
 * update password function called by route
 * @param {Object} req - request object
 * @param {Object} res - response object
 */
exports.updatePasswordRoute = async (req, res) => {
  try {
    console.log(req.body);
    const sentWithoutOldPassword = req.body && req.body.sentWithoutOldPassword || false;
    const data = matchedData(req);
    const user = await findUserById(req.user._id);
    console.log("=======");
    console.log(data);
    console.log("sentWithoutOldPassword", sentWithoutOldPassword);
    if (!sentWithoutOldPassword && !data.oldpassword) {
      return res.status(409).json({ errors: { msg: "Old password Not Sent."}});
    }
    if (!sentWithoutOldPassword) {
      let isPasswordMatch = await auth.checkPassword(data.oldpassword, user);
      if (!isPasswordMatch) {
        return res.status(409).json({ errors: { msg: "Old password does not matched."}});
      }
    }
    await updatePassword(data.password, user);
    if (user.needToUpdatePasswordInSession) {
      const userDoc = await User.findOne({
        "_id": user._id,
      });
      if (userDoc) {
        userDoc.needToUpdatePasswordInSession = false;
        await userDoc.save();
      }
    }
    return res.status(200).json({ message: "Your password has been changed successfully."});
  } catch (error) {
    utils.handleError(res, error);
  }
};
/**
 * Updates a user details in database
 * @param {Object} data - user object
 * @param {Object} user - user object
 */
const updateCustomerDetails = async (data, user) => {
  return new Promise((resolve, reject) => {
    user.first_name = data.first_name;
    user.last_name = data.last_name;
    user.name = data.name;
    user.email = data.email;
    user.save((err, item) => {
      utils.itemNotFound(err, item, reject, "NOT FOUND");
      resolve(item);
    });
  });
};

exports.userUpdate = async (req, res) => {
  try {
    const data = matchedData(req);
    const user = await findUserById(req.user._id);
    await updateCustomerDetails(data, user);
    return res.status(200).json({ message: "Your details has been updated successfully." });
  } catch (error) {
    utils.handleError(res, error);
  }
};
