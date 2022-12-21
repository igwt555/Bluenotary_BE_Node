import { Document } from 'mongoose'

export interface IPDFDROPPEDELEMENTSDATA extends Document {
    sessionid: string,
    templateid: string,
    droppedElements: any[],
    droppedElementsDocIdWise: object
}
