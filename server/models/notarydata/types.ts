import { Document } from 'mongoose'

export interface INOTARYDATA extends Document {
  certfilename: string
  certfileUrl: string
  certfileLocation: string,
  certfileSource: string,
  certfileAddedAt: Date,
  sealfilename: string
  sealdata: string
  commissionExpiresOn: number
  dcpassword: string
  county: string
  userId: string
  email: string
  fileKey: string,
  notaryCertificates: any[],
  notaryCopyOfCommissionLetterName: string,
  notaryCopyOfCommissionLetterUrl: string,
  notaryCopyOfCommissionLetterKey: string,
  stripeAccountName: string,
  stripeAccountLink: string,
  stripeAccountLoginLink: string,
  stripeAccountLinkValidTill: number,
  upgradeStripeSessionId: string,
  subscriptionExpiresOn: number,
}
