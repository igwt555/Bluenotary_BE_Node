import mongoose, { Schema } from 'mongoose'
import { IPDFDROPPEDELEMENTSDATA } from './types'
const ObjectId = mongoose.Schema.Types.ObjectId
export const PDFDroppedElementsSchema: Schema<IPDFDROPPEDELEMENTSDATA> =
new mongoose.Schema(
  {
    sessionid: {
        type: ObjectId,
        ref: 'Newsessiondata'
    },
    templateid: {
        type: ObjectId,
        ref: 'DocumentTemplate'
    },
    droppedElements: {
      type: Array,
      default: []
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
export const PDFDroppedElementsModel =
mongoose.model<IPDFDROPPEDELEMENTSDATA>('pdfdroppedelementsdata', PDFDroppedElementsSchema);
