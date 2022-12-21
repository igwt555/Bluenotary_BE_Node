import * as utils from '../middleware/utils';

export const dbBackup = async () => {
    try {
        console.log('utils:', utils)
    } catch (error) {
        console.error('db_backup')
    }
};
