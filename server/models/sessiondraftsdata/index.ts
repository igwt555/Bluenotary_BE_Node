import mongoose, { Schema } from 'mongoose'
import { ISESSIONDRAFTSDATA } from './types'
const ObjectId = mongoose.Schema.Types.ObjectId
export const SessionDraftsSchema: Schema<ISESSIONDRAFTSDATA> =
new mongoose.Schema(
  {
    sessionid: {
        type: ObjectId,
        ref: 'Newsessiondata'
    },
    droppedElementsDocIdWise: {
      type: Object,
      default: {}
    }
  },
  {
    versionKey: false,
    timestamps: true
  }
)
export const SessionDraftsModel = mongoose.model<ISESSIONDRAFTSDATA>('sessiondraftsdata', SessionDraftsSchema);
