const mongoose = require("mongoose");

const UserDetailsSchema = new mongoose.Schema(
  {
    sessionid: {
        type: Object,
    },
    userId: {
        type: Object,
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

module.exports = mongoose.model("UserDetails", UserDetailsSchema);
