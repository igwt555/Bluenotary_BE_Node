const mongoose = require("mongoose");
const ObjectId = mongoose.Schema.Types.ObjectId;

const DocumentTemplateSchema = new mongoose.Schema(
  {
    uploadedBy: {
      type: ObjectId,
      ref: "User",
    },
    type: {
      type: String,
      enum: ["predefined", "custom"],
      default: "custom",
    },
    name: String,
    documentUrl: String,
    key: String,
    bucketName: String,
  },
  {
    versionKey: false,
    timestamps: true,
  },
);
module.exports = mongoose.model("DocumentTemplate", DocumentTemplateSchema);
