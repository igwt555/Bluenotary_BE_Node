import { Document } from 'mongoose'

export interface INEWSESSION extends Document {
  sessionid: string
  userId: string
  sessionCode: string,
  notaryUserId: string,
  invitedByCustomer: string,
  currentStage: string,
  originalDocumentId: string,
  originalDocumentIds: any[],
  finalDocumentId: string,
  videoFileDocumentId: string,
  finalDocumentIdWithDC: string,
  x509Certificate: string,
  stagesHistory: any[],
  multiSignerList: any[],
  meetingdate: string,
  meetingdatetimeobj: Date,
  meetingTimeZone: string,
  attachCertificate: boolean,
  paid: boolean,
  sessionActive: boolean,
  sessionActiveFrom: any,
  notorizationType: string,
  costOfNotarization: any[],
  finalCostOfNotarization: string,
  emptyPagesAdded: number,
  emptyPagesAddedDocIdWise: object,
  failMessage: string,
  status: string,
  stripePaymentData: any,
  kbaStartedAt: Date,
  notorizationTiming: string,
  sessionChargeOnBusinessUser: boolean,
  sessionCreatedByBusinessUser: boolean,
  sessionOpenCallForTaking: boolean,
  sessionOpenCallForTakingAt: Date,
  archieved: boolean,
  archievedBy: any[],
  archievedAt: Date,
  createdAt: Date,
  sessionPickedCallForTakingAt: Date,
  sessionOpenCallForWitness: boolean,
  sessionOpenCallForWitnessAt: Date,
  maxWitnessJoined: number,
  videoSavingProcessingStage: string,
  videoSavingProcessingError: string,
  sessionType: string,
  typeOfKBA: string,
  skipCustomerKBACheck: boolean,
  testingAccSession: boolean,
  sessionCustomCharges: any[]
}
