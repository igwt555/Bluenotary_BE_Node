import dotenv from 'dotenv';
dotenv.config();
import * as utils from '../middleware/utils';
// import mongoose from 'mongoose'
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripeTest = require('stripe')(process.env.STRIPE_SECRET_KEY_TEST);
const User = require('../models/user');

exports.stripeBuisnessSessionStatus = async (req, res) => {
  try {
    const user = req.user;
    const userModel = await User.findOne({ _id: req.user._id });
    if (userModel.upgradeStripeSessionId) {
      let stripeToUse;
      if (user.testingacc) {
        stripeToUse = stripeTest
      } else {
        stripeToUse = stripe
      }
      const session = await stripeToUse.checkout.sessions.retrieve(userModel.upgradeStripeSessionId);
      if (session.payment_status === 'paid') {
        userModel.memberType = userModel.tempSubscriptionType;
        userModel.subscriptionExpiresOn = session.expires_at;
        userModel.save();
      }
      res.status(200).json(session);
    }
  } catch (error) {
    utils.handleError(res, error);
  }
};
exports.stripeBusinessCheckoutSession = async (req, res) => {
  try {
    const user = req.user;
    const userData = await User.findOne({ _id: req.user._id })
    let stripeToUse;
    if (user.testingacc) {
      stripeToUse = stripeTest
    } else {
      stripeToUse = stripe
    }
    const session = await stripeToUse.checkout.sessions.create({
      line_items: [{
        price: (
        req.body.memberType === 'pro' ?
        process.env.BUSINESS_SUBSCRIPTION_PRO_ID :
        process.env.BUSINESS_SUBSCRIPTION_PREMIUM_ID),
        quantity: 1
      }],
      customer_email: userData.email,
      mode: 'subscription',
      success_url: process.env.FRONT_URL + '/business/upgrade/success',
      cancel_url: process.env.FRONT_URL + '/business/account-settings'
    });
    userData.upgradeStripeSessionId = session.id;
    userData.tempSubscriptionType = req.body.memberType;
    userData.save();
    res.status(200).json(session);
  } catch (error) {
    utils.handleError(res, error);
  }
};
