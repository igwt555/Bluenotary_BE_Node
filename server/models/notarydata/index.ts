import mongoose, { Schema } from 'mongoose'
import { INOTARYDATA } from './types'
const ObjectId = mongoose.Schema.Types.ObjectId

const notaryCertificatesSchema = new Schema({
  name: {
    type: String
  },
  url: {
    type: String
  },
  key: {
    type: String
  }
});

export const NotaryDataSchema: Schema<INOTARYDATA> = new mongoose.Schema(
  {
    certfilename: {
      type: String,
      defualt: ''
    },
    certfileLocation: {
      type: String,
      defualt: ''
    },
    certfileUrl: {
      type: String,
      defualt: ''
    },
    certfileSource: {
      type: String,
      defualt: ''
    },
    certfileAddedAt: {
      type: Date,
      defualt: ''
    },
    sealfilename: {
      type: String,
      defualt: ''
    },
    sealdata: {
      type: String,
      defualt: ''
    },
    userId: {
      type: ObjectId,
      ref: 'User'
    },
    email: {
      type: String,
      defualt: ''
    },
    commissionExpiresOn: Number,
    upgradeStripeSessionId: String,
    subscriptionExpiresOn: Number,
    county: {
      type: String,
      defualt: ''
    },
    dcpassword: {
      type: String,
      defualt: ''
    },
    fileKey: {
      type: String,
      defualt: ''
    },
    notaryCertificates: [notaryCertificatesSchema],
    notaryCopyOfCommissionLetterName: {
      type: String,
      defualt: ''
    },
    notaryCopyOfCommissionLetterUrl: {
      type: String,
      defualt: ''
    },
    notaryCopyOfCommissionLetterKey: {
      type: String,
      defualt: ''
    },
    stripeAccountName: {
      type: String,
      defualt: ''
    },
    stripeAccountLink: {
      type: String,
      defualt: ''
    },
    stripeAccountLoginLink: {
      type: String,
      defualt: ''
    },
    stripeAccountLinkValidTill: {
      type: Number,
      defualt: ''
    }
  },
  {
    versionKey: false,
    timestamps: true
  }
)
export const NotaryDataModel = mongoose.model<INOTARYDATA>('notarydata', NotaryDataSchema);
