import { logger } from 'firebase-functions';

const debug = false;

export default function log(...contents: any[]) {
    if (debug) {
        logger.log(...contents);
    }
}