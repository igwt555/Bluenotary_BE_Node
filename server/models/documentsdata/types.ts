import { Document } from 'mongoose'

export interface IDOCUMENT extends Document {
  sessionid: string,
  originalDocumentId: string,
  documentCategory: string,
  name: string,
  url: string,
  type: string,
  size: string,
  key: string,
  bucketName: string,
  uploadedBy: string,
  uploadedStage: string
}
