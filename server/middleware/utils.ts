import { validationResult as expressValidator } from 'express-validator'
import requestIp from 'request-ip'

// import { CampaignModel as Campaign } from '../../models/campaign'
/**
 * Removes extension from file
 * @param {string} file - filename
 */
export const removeExtensionFromFile = (file) => {
  return file.split('.').slice(0, -1).join('.').toString()
}
export const getIP = (req) => requestIp.getClientIp(req)

/**
 * Gets IP from user
 * @param {*} req - request object
 */

/**
 * Gets browser info from user
 * @param {*} req - request object
 */
export const getBrowserInfo = (req) => req.headers['user-agent']

/**
 * Gets country from user using CloudFlare header 'cf-ipcountry'
 * @param {*} req - request object
 */
export const getCountry = (req) =>
  req.headers['cf-ipcountry'] ? req.headers['cf-ipcountry'] : 'XX'

/**
 * Handles error by printing to console in development env and builds and sends an error response
 * @param {Object} res - response object
 * @param {Object} err - error object
 */
export const handleError = (res, err) => {
  // Prints error in console

  if (process.env.NODE_ENV === 'development') {
    console.log(err)
  }
  res.status(err.statusCode || 500).json({
    errors: {
      msg: err.message,
      reLoginUrl: err ? err.reLoginUrl : ''
    }
  })
}

/**
 * Builds error object
 * @param {number} code - error code
 * @param {string} message - error text
 */
export const buildErrObject = (code, message) => {
  return {
    code,
    message
  }
}

/**
 * Builds error for validation files
 * @param {Object} req - request object
 * @param {Object} res - response object
 * @param {Object} next - next object
 */
export const validationResult = (req, res, next) => {
  console.log('validationResult - ', req.query)
  console.log('validationResult - ', req.body)

  try {
    expressValidator(req).throw()
    if (req.body.email) {
      req.body.email = req.body.email.toLowerCase()
    }
    return next()
  } catch (err) {
    return handleError(res, buildErrObject(422, err))
  }
}

/**
 * Builds success object
 * @param {string} message - success text
 */
export const buildSuccObject = (message) => {
  return {
    msg: message
  }
}

/**
 * Checks if given ID is good for MongoDB
 * @param {string} id - id to check
 */
export const isIDGood = async (id) => {
  return new Promise((resolve, reject) => {
    const goodID = String(id).match(/^[0-9a-fA-F]{24}$/)
    return goodID ? resolve(id) : reject(buildErrObject(422, 'ID_MALFORMED'))
  })
}

/**
 * Item not found
 * @param {Object} err - error object
 * @param {Object} item - item result object
 * @param {Object} reject - reject object
 * @param {string} message - message
 */
export const itemNotFound = (err, item, reject, message) => {
  if (err) {
    reject(buildErrObject(422, err.message))
  }
  if (!item) {
    reject(buildErrObject(404, message))
  }
}

/**
 * Item already exists
 * @param {Object} err - error object
 * @param {Object} item - item result object
 * @param {Object} reject - reject object
 * @param {string} message - message
 */
export const itemAlreadyExists = (err, item, reject, message) => {
  if (err) {
    reject(buildErrObject(422, err.message))
  }
  if (item) {
    reject(buildErrObject(422, message))
  }
}
export const delay = async (timeout) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve('true')
    }, timeout)
  })
}

export const generateRandomPassword = (length) => {
  let generatedPassword = '';
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0, n = charset.length; i < length; ++i) {
    generatedPassword += charset.charAt(Math.floor(Math.random() * n));
  }
  return generatedPassword;
}
