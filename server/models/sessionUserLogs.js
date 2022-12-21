const mongoose = require("mongoose");

const SessionUserLogsSchema = new mongoose.Schema(
  {
    sessionid: {
        type: Object,
    },
    userId: {
        type: Object,
    },
    userDoc: {
        type: Object,
    },
    userType: {
        type: String,
    },
    actionType: {
        type: String,
    },
    actionStage: {
        type: String,
    },
    ip: {
        type: String,
    },
    browser: {
        type: String,
    },
    country: {
        type: String,
    },
    kbaAnswers: {
        type: Array,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("SessionUserLogs", SessionUserLogsSchema);
