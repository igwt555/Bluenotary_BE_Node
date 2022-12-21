import _ from 'lodash';
import emailer from '../middleware/emailer';
import { IdentityModel } from '../models/identitydata';
import { NewSessionModel } from '../models/newsessiondata';
const User = require('../models/user');
const SESSION_TIMEOUT_IN_MINUTES = 30

export const startSessionAlertingService = async (sessionid, userId, io) => {
    const sessionDoc = await NewSessionModel.findOne({
        _id: sessionid,
        status: {$ne: 'complete'}
    })
    if (!sessionDoc) {
        return
    }
    let saveNeeded = false;
    if (!sessionDoc.sessionActive) {
        sessionDoc.sessionActive = true;
        sessionDoc.sessionActiveFrom = new Date();
        saveNeeded = true;
    } else {
        const diff = new Date().valueOf() - sessionDoc.sessionActiveFrom.valueOf()
        const minutesDifference = diff / (60 * 1000)
        if (minutesDifference > SESSION_TIMEOUT_IN_MINUTES) {
            sessionDoc.sessionActiveFrom = new Date()
            saveNeeded = true;
        }
    }
    console.log('saveNeeded', saveNeeded)
    if (saveNeeded) {
        sessionDoc.save();
        const useridsForSocketCall = _.compact([sessionDoc.userId, sessionDoc.notaryUserId])
        const dataToSend = {
            sessionid: String(sessionid),
            event: 'sessionActivityChanged'
        }
        const shortSessionID = (sessionid).toString().substr((sessionid).toString().length - 5).toUpperCase();
        const sessionUserDoc = await User.findOne({
            _id: sessionDoc.userId
        })
        console.log('sessionUserDoc', sessionUserDoc)
        if (!(sessionUserDoc && sessionUserDoc.testingacc)) {
            if (sessionDoc.notaryUserId && sessionDoc.notaryUserId !== null) {
                // Assigned Notary Alert
                emailer.sendEmailToSelectedNotary(shortSessionID, sessionDoc.notaryUserId, String(sessionid));
            } else {
                // Unassigned Open Call
                const identityModelData = await IdentityModel.findOne({
                    sessionid
                })
                emailer.sendEmailToAllNotaries(shortSessionID, sessionDoc, identityModelData);
            }
        }
        _.map(useridsForSocketCall, (localUserId) => {
            io.in('USER_' + String(localUserId)).emit('updates', dataToSend);
        })
    }
};

export const endSessionAlertingService = async (sessionid, userId, io) => {
    const sessionDoc = await NewSessionModel.findOne({
        _id: sessionid
    })
    if (!sessionDoc) {
        return
    }
    console.log('sessionDoc.sessionActive', sessionDoc.sessionActive)
    if (sessionDoc.sessionActive) {
        sessionDoc.sessionActive = undefined
        sessionDoc.sessionActiveFrom = undefined
        console.log('sessionDoc', sessionDoc)
        await sessionDoc.save()
        const useridsForSocketCall = _.compact([sessionDoc.userId, sessionDoc.notaryUserId])
        const dataToSend = {
            sessionid: String(sessionid),
            event: 'sessionActivityChanged'
        }
        console.log('useridsForSocketCall', useridsForSocketCall)
        if (io) {
            _.map(useridsForSocketCall, (localUserId) => {
                io.in('USER_' + String(localUserId)).emit('updates', dataToSend);
            })
        }
    }
};
