import { httpsCallable } from 'firebase/functions';
import { GetWordDataProps, UnrollEtymologyProps } from '../functions/src';
import { functions } from './index';
import { WordListing } from './types';

export async function callGetWordData(
    word: string,
    language: string = '',
    populateEtymologies: boolean = false,
): Promise<WordListing[]> {
    const getWordData = httpsCallable<GetWordDataProps, WordListing[]>(
        functions,
        'getWordDataCallable',
        {
            timeout: 60 * 60 * 1000,
        }
    );
    const res = await getWordData(
        {
            word,
            language,
            populateEtymologies,
        }
    );

    return res.data;
}

export function callUnrollEtymology(
    listing: WordListing,
    getDescendants: boolean = false,
    deepDescendantSearch: boolean = false,
) {
    const unrollEtymology = httpsCallable<UnrollEtymologyProps, boolean>(
        functions,
        'unrollEtymologyCallable',
        {
            timeout: 60 * 60 * 1000,
        }
    );
    return unrollEtymology(
        {
            listing,
            getDescendants,
            deepDescendantSearch,
        }
    )
}