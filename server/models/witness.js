const mongoose = require("mongoose");
const ObjectId = mongoose.Schema.Types.ObjectId;

const WitnessSchema = new mongoose.Schema(
  {
    userid: {
      type: ObjectId,
      ref: "User",
    },
    usertype: String,
    firstName: String,
    lastName: String,
    email: String,
    phoneNumber: String,
    deleted: Boolean,
    deletedAt: Date,
  },
  {
    versionKey: false,
    timestamps: true,
  },
);
module.exports = mongoose.model("Witness", WitnessSchema);
