import { WordListing } from './types';

export async function callGetWordData(
    word: string,
    language: string = '',
    populateEtymologies: boolean = false,
): Promise<WordListing[]> {
    const res = await fetch(
        'https://callgetworddata-jlw6wmvzma-uc.a.run.app',
        // 'http://127.0.0.1:5001/etymologez/us-central1/callGetWordData',
        {
            method: 'POST',
            body: JSON.stringify({
                word,
                language,
                populateEtymologies,
            }),
            headers: new Headers({'Content-Type': 'application/json'})
        }
    );

    return await res.json() as WordListing[];
}

export async function callUnrollEtymology(
    listing: WordListing,
    getDescendants: boolean = false,
    deepDescendantSearch: boolean = false,
): Promise<boolean> {
    await fetch(
        // 'http://127.0.0.1:5001/etymologez/us-central1/callUnrollEtymology',
        'https://callunrolletymology-jlw6wmvzma-uc.a.run.app',
        {
            method: 'POST',
            body: JSON.stringify({
                listing,
                getDescendants,
                deepDescendantSearch,
            }),
            headers: new Headers({'Content-Type': 'application/json'})
        }
    );

    return true;
}