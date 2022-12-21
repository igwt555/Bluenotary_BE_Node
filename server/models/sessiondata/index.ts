import mongoose, { Schema } from 'mongoose'
import { ISESSION } from './types'
const ObjectId = mongoose.Schema.Types.ObjectId
export const SessionSchema: Schema<ISESSION> = new mongoose.Schema(
  {
    sessionid: String,
    filename: {
      type: String,
      defualt: ''
    },
    fileUrl: {
      type: String,
      defualt: ''
    }, fileKey: {
      type: String,
      defualt: ''
    },
    userId: {
      type: ObjectId,
      ref: 'User'
    }, email: String
  },
  {
    versionKey: false,
    timestamps: true
  }
)
export const SessionModel = mongoose.model<ISESSION>('sessions', SessionSchema);
