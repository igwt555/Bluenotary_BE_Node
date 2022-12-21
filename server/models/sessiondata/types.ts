import { Document } from 'mongoose'

export interface ISESSION extends Document {
  sessionid: string
  filename: string
  fileUrl: string
  userId: string
  email: string
  fileKey: string
}
