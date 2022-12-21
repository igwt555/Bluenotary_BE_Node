import * as utils from '../middleware/utils';

export const demo = async () => {
    console.log(utils)
    try {
        console.log('db_backup:')
    } catch (error) {
        console.error('db_backup')
    }
};
