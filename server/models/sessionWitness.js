const mongoose = require("mongoose");
const ObjectId = mongoose.Schema.Types.ObjectId;

const sessionWitnessSchema = new mongoose.Schema(
  {
    sessionid: {
      type: ObjectId,
      ref: "Newsessiondata",
    },
    witnessid: {
      type: ObjectId,
      ref: "Witness",
    },
    userid: {
      type: ObjectId,
      ref: "User",
    },
    url: String,
    deleted: Boolean,
    deletedAt: Date,
  },
  {
    versionKey: false,
    timestamps: true,
  },
);
module.exports = mongoose.model("SessionWitness", sessionWitnessSchema);
