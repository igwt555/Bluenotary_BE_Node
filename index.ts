import bodyParser from 'body-parser';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import _ from 'lodash'
import morgan from 'morgan';
// const utils = require("./server/middleware/utils");
// const url = `redis://192.168.1.40:6379`;
// const redisClient = require('redis').createClient({
// 	url
// })
const redisClient = require('redis').createClient()
const fs = require('fs')

import mongoose from 'mongoose'
import path from 'path';

dotenv.config();

const initMongo = require('./server/config/mongo');

const app = express();
const cron = require('node-cron');
const controller = require('./server/controllers/api');
const services = require('./server/service/AlertingService')
// console.log(controller)
// console.log(services)

const xmlparser = require('express-xml-bodyparser');

const videoSavingDir = './tmp';

if (!fs.existsSync(videoSavingDir)) {
    fs.mkdirSync(videoSavingDir);
}
initMongo();

let videoProcessingServer = false;
if (process.env.VIDEO_PROCESSING_SERVER) {
	videoProcessingServer = true;
}

if (!videoProcessingServer) {
	const server = app.listen('3001', () => {
		console.log('server listening at', server.address())
	})
	const io = require('socket.io')(server, {
		path: '/default_socket/'
	})

	// require('child_process').exec('redis-cli FLUSHALL', (error, stdout, stderr) => {
	// 	const lines = stdout.split('\n');
	// 	console.log('REDIS CLEAN : ', lines);
	// });

	app.set('port', process.env.PORT || 3000);
	app.use(morgan('dev'));
	app.use(
		bodyParser.json({
			limit: '20mb'
		})
	);
	app.use(
		bodyParser.urlencoded({
			limit: '20mb',
			extended: true
		})
	);
	app.use(xmlparser());
	app.use(bodyParser.raw({ type: 'application/json' }));
	app.use(bodyParser.raw({ type: 'application/xml' }));
	app.use(cors());
	app.use(compression());
	app.use(helmet());
	app.use(express.static('public'));
	app.set('views', path.join(__dirname, 'views'));
	app.engine('html', require('ejs').renderFile);
	app.set('view engine', 'html');
	app.use('/api', require('./server/routes'));
	app.listen(app.get('port'), '0.0.0.0');
	process.setMaxListeners(0);
	const UserActivityLogs = require('./server/models/userActivityLogs');
	const SessionUserLogs = require('./server/models/sessionUserLogs');

	cron.schedule('0 */24 * * *', () => {
	  console.log('Running a cron every 24 hour');
	  // after 24hrs, if no update, remove document and set the session status to "expired"
	  // controller.checkExpiredDocument();
	  // after 1 day, status is not completed  remove document and set the session status to "expired"
	  controller.checkExpiredSession();
	});
	// task.start();
	cron.schedule('0 0 1 * *', () => {
		controller.checkExpiredCommissionLetter();
	});

	cron.schedule('*/10 * * * *', () => {
		controller.checkForSessionsInNextHourAndSendReminderEmail();
	});

	cron.schedule('*/10 * * * *', () => {
		controller.checkForSessionsForWhichSessionTimeHasPassedAndSessionNotDone();
	});
	cron.schedule('*/59 * * * *', () => {
		controller.precomputeOnboardingStatusOfNotaries();
	});

	redisClient.connect().then(() => {
		io.on('connection', (socket) => {
			socket.on('initialize', (req) => {
				const userId = req.user
				const userSocketMapKey = 'usersocket_' + String(socket.id)
				redisClient.set(userSocketMapKey, String(userId), (err, newPrefix) => {
					// Expire this socket relation map after 6 hours, as most probably the socket id would have been changed
					redisClient.expire(userSocketMapKey, 21600, (err1, result) => {
						if (err1) {
							console.log(err1)
						}
					})
				})
			});
			socket.on('join_user', async (req) => {
				const userId = req.user;
				const socketRoomName = 'USER_' + String(userId);
				await socket.join(socketRoomName);
			});
			socket.on('leave_user', async (req) => {
				const userId = req.user;
				const socketRoomName = 'USER_' + String(userId);
				await socket.leave(socketRoomName);
			});
			socket.on('join_session', async (req) => {
				try {
					const sessionid = req.sessionid;
					const socketRoomName = 'SESSION_' + String(sessionid);
					await socket.join(socketRoomName);
					const userId = req.user
					console.log('userId', userId)
					io.to(socket.id).emit('updates', {
						event: 'join_success',
						userId,
						sessionid
					});
					const socketIds = _.map(await io.in(socketRoomName).fetchSockets(), 'id');
					const redisSocketKeys = _.map(socketIds, (sockid) => {
						return 'usersocket_' + sockid
					})
					if (!redisSocketKeys.length) {
						redisSocketKeys.push('usersocket_' + String(socket.id))
					}
					const userIds = await redisClient.mGet(redisSocketKeys) || []
					const finalUserIds = _.compact(_.uniq(userIds));
					if (finalUserIds.indexOf(userId) === -1) {
						finalUserIds.push(userId)
					}
					console.log('finalUserIds', finalUserIds)
					const dataToSend = {
						event: 'current_session_users',
						userId,
						sessionid,
						finalUserIds
					}
					io.in(socketRoomName).emit('updates', dataToSend);
					const sessionUserLogsData = new SessionUserLogs({
						sessionid: new mongoose.Types.ObjectId(sessionid),
						userId: new mongoose.Types.ObjectId(userId),
						actionType: 'join_session'
						// ip: utils.getIP(req),
						// browser: utils.getBrowserInfo(req),
						// country: utils.getCountry(req),
					});
					sessionUserLogsData.save();
					await services.startSessionAlertingService(sessionid, userId, io)
				} catch (err) {
					console.log(err)
				}
			});
			socket.on('leave_session', async (req) => {
				try {
					const sessionid = req.sessionid;
					const socketRoomName = 'SESSION_' + String(sessionid);
					await socket.leave(socketRoomName);
					const userId = req.user
					console.log('socketRoomName LEAVE CALLED', socketRoomName)
					const socketIds = _.map(await io.in(socketRoomName).fetchSockets(), 'id');
					const redisSocketKeys = _.map(socketIds, (sockid) => {
						return 'usersocket_' + sockid
					})
					console.log('sleave', redisSocketKeys)
					if (redisSocketKeys.length) {
						const userIds = await redisClient.mGet(redisSocketKeys)
						const finalUserIds = _.compact(_.uniq(userIds));
						console.log('sleave userids', finalUserIds)
						const dataToSend = {
							event: 'current_session_users',
							userId,
							sessionid,
							finalUserIds
						}
						console.log('sleave dataToSend', dataToSend)
						io.in(socketRoomName).emit('updates', dataToSend);
					}
					const sessionUserLogsData = new SessionUserLogs({
						sessionid: new mongoose.Types.ObjectId(sessionid),
						userId: new mongoose.Types.ObjectId(userId),
						actionType: 'leave_session'
						// ip: utils.getIP(req),
						// browser: utils.getBrowserInfo(req),
						// country: utils.getCountry(req),
					});
					sessionUserLogsData.save();
				} catch (err) {
					console.log(err)
				}
			});
			socket.on('session_terminated', (req) => {
				try {
					const sessionid = req.sessionid;
					const socketRoomName = 'SESSION_' + String(sessionid);
					const userId = req.user
					const dataToSend = {
						event: 'session_terminated',
						userId,
						sessionid
					}
					socket.to(socketRoomName).emit('updates', dataToSend);
					const sessionUserLogsData = new SessionUserLogs({
						sessionid: new mongoose.Types.ObjectId(sessionid),
						userId: new mongoose.Types.ObjectId(userId),
						actionType: 'session_terminated'
						// ip: utils.getIP(req),
						// browser: utils.getBrowserInfo(req),
						// country: utils.getCountry(req),
					});
					sessionUserLogsData.save();
					services.endSessionAlertingService(sessionid, userId, io)
				} catch (err) {
					console.log(err)
				}
			});
			socket.on('session_completed', (req) => {
				try {
					const sessionid = req.sessionid;
					const socketRoomName = 'SESSION_' + String(sessionid);
					const userId = req.user
					const dataToSend = {
						event: 'session_completed',
						userId,
						sessionid
					}
					console.log('dataToSend', dataToSend)
					socket.to(socketRoomName).emit('updates', dataToSend);
					const sessionUserLogsData = new SessionUserLogs({
						sessionid: new mongoose.Types.ObjectId(sessionid),
						userId: new mongoose.Types.ObjectId(userId),
						actionType: 'session_completed'
						// ip: utils.getIP(req),
						// browser: utils.getBrowserInfo(req),
						// country: utils.getCountry(req),
					});
					sessionUserLogsData.save();
					services.endSessionAlertingService(sessionid, userId, io)
				} catch (err) {
					console.log(err)
				}
			});
			socket.on('session_completed_payment_failed', (req) => {
				try {
					const sessionid = req.sessionid;
					const socketRoomName = 'SESSION_' + String(sessionid);
					const userId = req.user
					const dataToSend = {
						event: 'session_completed_payment_failed',
						userId,
						sessionid
					}
					console.log('dataToSend', dataToSend)
					socket.to(socketRoomName).emit('updates', dataToSend);
					const sessionUserLogsData = new SessionUserLogs({
						sessionid: new mongoose.Types.ObjectId(sessionid),
						userId: new mongoose.Types.ObjectId(userId),
						actionType: 'session_completed'
						// ip: utils.getIP(req),
						// browser: utils.getBrowserInfo(req),
						// country: utils.getCountry(req),
					});
					sessionUserLogsData.save();
					services.endSessionAlertingService(sessionid, userId, io)
				} catch (err) {
					console.log(err)
				}
			});
			socket.on('dropped_field_updates', (req) => {
				const sessionid = req.sessionid
				const userId = req.user
				const updatedField = req.updatedField
				const socketRoomName = 'SESSION_' + String(sessionid);
				const dataToSend = {
					event: 'dropped_field_updates',
					userId,
					sessionid,
					updatedField
				}
				socket.to(socketRoomName).emit('updates', dataToSend);
			});
			socket.on('video_capture_started', (req) => {
				const sessionid = req.sessionid
				const userId = req.user
				const socketRoomName = 'SESSION_' + String(sessionid);
				const dataToSend = {
					event: 'video_capture_started',
					userId,
					sessionid
				}
				socket.to(socketRoomName).emit('updates', dataToSend);
			});
			socket.on('video_capture_stopped', (req) => {
				const sessionid = req.sessionid
				const userId = req.user
				const socketRoomName = 'SESSION_' + String(sessionid);
				const dataToSend = {
					event: 'video_capture_stopped',
					userId,
					sessionid
				}
				socket.to(socketRoomName).emit('updates', dataToSend);
			});
			socket.on('session_completion_started', (req) => {
				const sessionid = req.sessionid
				const userId = req.user
				const socketRoomName = 'SESSION_' + String(sessionid);
				const dataToSend = {
					event: 'session_completion_started',
					userId,
					sessionid
				}
				console.log('session_completion_started')
				socket.to(socketRoomName).emit('updates', dataToSend);
			});
			socket.on('session_completion_finished', (req) => {
				const sessionid = req.sessionid
				const userId = req.user
				const socketRoomName = 'SESSION_' + String(sessionid);
				const dataToSend = {
					event: 'session_completion_finished',
					userId,
					sessionid
				}
				socket.to(socketRoomName).emit('updates', dataToSend);
			});
			socket.on('full_session_fields', (req) => {
				const sessionid = req.sessionid
				const userId = req.user
				const fullFields = req.fullFields
				const emptyPagesAdded = req.emptyPagesAdded
				const socketRoomName = 'SESSION_' + String(sessionid);
				const dataToSend = {
					event: 'full_session_fields',
					userId,
					sessionid,
					fullFields,
					emptyPagesAdded
				}
				socket.to(socketRoomName).emit('updates', dataToSend);
			});
			socket.on('custom_charges_modified', (req) => {
				const sessionid = req.sessionid
				const userId = req.user
				const customChargesEditValues = req.customChargesEditValues
				const customChargesModified = req.customChargesModified
				const socketRoomName = 'SESSION_' + String(sessionid);
				const dataToSend = {
					event: 'custom_charges_modified',
					userId,
					sessionid,
					customChargesEditValues,
					customChargesModified
				}
				socket.to(socketRoomName).emit('updates', dataToSend);
			});
			socket.on('new_page_added', (req) => {
				const sessionid = req.sessionid
				const userId = req.user
				const socketRoomName = 'SESSION_' + String(sessionid);
				const dataToSend = {
					event: 'new_page_added',
					userId,
					sessionid
				}
				socket.to(socketRoomName).emit('updates', dataToSend);
			});
			socket.on('session_witness_management_changed', (req) => {
				const sessionid = req.sessionid
				const userId = req.user
				const socketRoomName = 'SESSION_' + String(sessionid);
				const dataToSend = {
					event: 'session_witness_management_changed',
					userId,
					sessionid
				}
				socket.to(socketRoomName).emit('updates', dataToSend);
			});
			socket.on('session_witness_removed', (req) => {
				const sessionid = req.sessionid
				const userId = req.user
				const removedUserId = req.removedUserId
				const socketRoomName = 'SESSION_' + String(sessionid);
				const dataToSend = {
					event: 'session_witness_removed',
					userId,
					sessionid,
					removedUserId
				}
				socket.to(socketRoomName).emit('updates', dataToSend);
			});
			socket.on('current_selected_document_changed', (req) => {
				const sessionid = req.sessionid
				const userId = req.user
				const currentSelectedDocumentId = req.currentSelectedDocumentId
				const socketRoomName = 'SESSION_' + String(sessionid);
				const dataToSend = {
					event: 'current_selected_document_changed',
					userId,
					sessionid,
					currentSelectedDocumentId
				}
				socket.to(socketRoomName).emit('updates', dataToSend);
			});
			socket.on('pdf_video_session_stream', async (req) => {
				const sessionid = req.sessionid
				const blob = req.blob
				const user = req.user
				console.log(blob)
				fs.appendFile(videoSavingDir + '/SESSION_VIDEO_' + sessionid + '_' + String(user) + '.webm', blob, (err) => {
					if (err) { throw err; }
					console.log('Chunck Saved!', String(user));
				})
			});
			socket.on('serverSessionActivityChanged', async (req) => {
				const sessionid = req.sessionid
				const dataToSend = {
					event: 'sessionActivityChanged',
					sessionid
				}
				console.log(dataToSend)
				io.sockets.emit('updates', dataToSend);
			});
			socket.on('getActiveNotaryList', async (req) => {
				console.log('getActiveNotaryList')
				const activeUserIds = await redisClient.KEYS('active_userid_*')
				console.log('activeUserIds', activeUserIds)
				const dataToSend = {
					event: 'getActiveNotaryListOutput',
					count: activeUserIds.length
				}
				socket.emit('updates', dataToSend)
			});
			socket.on('connection_active', async (req) => {
				const user = req.user
				const url = req.url
				const userrole = req.userrole
				const memberType = req.memberType
				if (userrole === 'notary' && memberType !== 'free') {
					const userSocketMapKey = 'active_userid_' + String(user)
					const resp = await redisClient.set(userSocketMapKey, url)
					const expireResp = await redisClient.EXPIRE(userSocketMapKey, 150)
					console.log('resp, expireResp', resp, expireResp)
				}
				const userActivityLogsData = new UserActivityLogs({
					userId: new mongoose.Types.ObjectId(user),
					url
				});
				userActivityLogsData.save();
			});
		})
	})

	module.exports = app;

} else {
	cron.schedule('*/5 * * * *', () => {
		controller.pdfEditsVideoDocumentSaveSecondaryServer()
	});
}
