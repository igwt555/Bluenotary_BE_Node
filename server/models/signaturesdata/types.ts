import { Document } from 'mongoose'

export interface ISIGNATURESDATA extends Document {
  user: string,
  signaturedata: string,
  signaureFileName: string,
  signaureFileUrl: string,
  signaureFileType: string,
  signaureFileSize: string,
  signaureFileKey: string,
  signaureFileBucket: string,
  createdDocument: string,
  deleted: boolean,
  deletedAt: Date
}
