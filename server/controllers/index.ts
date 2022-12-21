/* eslint-disable */

const utils = require('../middleware/utils');
const { matchedData } = require('express-validator');
import { demo } from '../service/Demo';
export const demoController = async (req, res) => {
  try {
    req = matchedData(req);
    console.log('db_backup:', req);
    await demo();
    res.status(200).json({ message: 'Database backup queued successfully.' });
  } catch (error) {
    utils.handleError(res, error);
  }
};
export const dashboardOptimizationApiController = () => async (req, res) => {
  req = matchedData(req);
  try {
    res.status(200).json({ message: 'Database backup queued successfully.' });
  } catch (error) {
    utils.handleError(res, error);
  }
};

export const concernsController = () => async (req, res) => {
  req = matchedData(req);
  try {
    res.render('concerns', { name: 'Sherlynn' })
  } catch (error) {
    utils.handleError(res, error);
  }
};
