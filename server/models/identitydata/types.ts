import { Document } from 'mongoose'

export interface IDENTITYDATA extends Document {
  sessionid: string
  firstName: string
  middelName: string
  lastName: string
  userSsn: string
  userZipCode: string
  userState: string
  addressLine1: string
  addressLine2: string
  userId: string
  email: string
  birthdate: string
  stripeCustomerID: string
  stripeBrand: string
  last4: string
  exp_month: string
  exp_year: string,
  frontPhotoIdUrl: string,
  frontPhotoIdKey: string,
  frontPhotoIdName: string,
  frontPhotoIdType: string,
  frontPhotoIdSize: string,
  frontPhotoIdBucketName: string,
  backPhotoIdUrl: string,
  backPhotoIdKey: string,
  backPhotoIdName: string,
  backPhotoIdType: string,
  backPhotoIdSize: string,
  backPhotoIdBucketName: string,
  fillAPIResponseDoc: object,
  consumerPlusAPIResponseDoc: object,
  additionalSigner: boolean,
  additionalSignerNextStage: string,
  photoIdCaptureMethod: string,
  typeOfPhotoId: string,
  sessionDoc: object,
  cardAPICustomerReferenceNumber: string,
  cardAPIResponseDoc: object,
  evsRes: object
}
