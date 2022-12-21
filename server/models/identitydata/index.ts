import mongoose, { Schema } from 'mongoose'
import { IDENTITYDATA } from './types'
const ObjectId = mongoose.Schema.Types.ObjectId
export const IdentitySchema: Schema<IDENTITYDATA> = new mongoose.Schema(
  {
    sessionid: String,
    firstName: {
      type: String,
      defualt: ''
    },
    middelName: {
      type: String,
      defualt: ''
    },
    lastName: {
      type: String,
      defualt: ''
    },
    userId: {
      type: ObjectId,
      ref: 'User'
    },
    email: String,
    userSsn: String,
    userZipCode: String,
    userState: String,
    addressLine2: String,
    addressLine1: String,
    birthdate: String,
    stripeCustomerID: String,
    stripeBrand: String,
    last4: String,
    exp_month: String,
    exp_year: String,
    frontPhotoIdUrl: String,
    frontPhotoIdKey: String,
    frontPhotoIdName: String,
    frontPhotoIdType: String,
    frontPhotoIdSize: String,
    frontPhotoIdBucketName: String,
    backPhotoIdUrl: String,
    backPhotoIdKey: String,
    backPhotoIdName: String,
    backPhotoIdType: String,
    backPhotoIdSize: String,
    backPhotoIdBucketName: String,
    fillAPIResponseDoc: Object,
    consumerPlusAPIResponseDoc: Object,
    additionalSigner: Boolean,
    additionalSignerNextStage: String,
    photoIdCaptureMethod: String,
    typeOfPhotoId: String,
    cardAPICustomerReferenceNumber: String,
    cardAPIResponseDoc: Object,
    evsRes: Object
  },
  {
    versionKey: false,
    timestamps: true
  }
)
export const IdentityModel = mongoose.model<IDENTITYDATA>('identity', IdentitySchema);
