import mongoose, { Schema } from 'mongoose'
import { ISIGNATURESDATA } from './types'
const ObjectId = mongoose.Schema.Types.ObjectId
export const SignaturesDataSchema: Schema<ISIGNATURESDATA> = new mongoose.Schema(
  {
    user: {
      type: ObjectId,
      ref: 'User'
    },
    signaturedata: {
      type: String,
      defualt: ''
    },
    signaureFileName: {
      type: String,
      defualt: ''
    },
    signaureFileUrl: {
      type: String,
      defualt: ''
    },
    signaureFileType: {
      type: String,
      defualt: ''
    },
    signaureFileSize: {
      type: String,
      defualt: ''
    },
    signaureFileKey: {
      type: String,
      defualt: ''
    },
    signaureFileBucket: {
      type: String,
      defualt: ''
    },
    createdDocument: {
      type: String,
      default: ''
    },
    deleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date
    }
  },
  {
    versionKey: false,
    timestamps: true
  }
)
export const SignaturesDataModel = mongoose.model<ISIGNATURESDATA>('signaturesdata', SignaturesDataSchema);
