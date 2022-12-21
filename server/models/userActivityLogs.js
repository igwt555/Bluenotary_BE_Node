const mongoose = require("mongoose");

const UserActivityLogsSchema = new mongoose.Schema(
  {
    userId: {
        type: Object,
    },
    url: {
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
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("UserActivityLogs", UserActivityLogsSchema);
