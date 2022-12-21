const mongoose = require("mongoose");
const ObjectId = mongoose.Schema.Types.ObjectId;

const userNotaryRelationSchema = new mongoose.Schema(
  {
    customerid: {
      type: ObjectId,
      ref: "User",
    },
    notaryid: {
      type: ObjectId,
      ref: "User",
    },
    relationType: String,
    deleted: Boolean,
    deletedAt: Date,
    createdAt: Date,
  },
  {
    versionKey: false,
    timestamps: true,
  },
);
module.exports = mongoose.model("UserNotaryRelation", userNotaryRelationSchema);
