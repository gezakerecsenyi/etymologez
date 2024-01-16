import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getListingIdentifier } from '../../src/global/util';
import { SearchPing, WordListing } from '../../src/types';
import { usingCache } from './cache';
import getWordData from './getWordData';
import populateEtymology from './populateEtymology';
import RecordSet from './RecordSet';
import unrollEtymology from './unrollEtymology';

initializeApp();
export const firestore = getFirestore();
firestore.settings({
    ignoreUndefinedProperties: true,
});

export interface GetWordDataProps {
    word: string,
    language: string,
    populateEtymologies: boolean,
}

export const getWordDataCallable = onCall<GetWordDataProps>(
    {
        region: 'us-central1',
        timeoutSeconds: 60 * 60,
        memory: '16GiB',
        cpu: 4,
        cors: true,
    },
    async (request) => {
        try {
            console.log('getting word');

            return await usingCache(async () => {
                const data = await getWordData(
                    request.data.word,
                    request.data.language,
                );

                if (request.data.populateEtymologies) {
                    return (
                        await Promise.all(data.listings.map(e => populateEtymology(e)))
                    ).map((e, i) => ({
                        ...data.listings[i],
                        etymology: e,
                    }));
                }

                return data.listings;
            });
        } catch (e) {
            throw new HttpsError("internal", '');
        }
    },
);

export interface UnrollEtymologyProps {
    listing: WordListing,
    getDescendants: boolean,
    deepDescendantSearch: boolean,
}
export const unrollEtymologyCallable = onCall<UnrollEtymologyProps>(
    {
        region: 'us-central1',
        timeoutSeconds: 60 * 60,
        memory: '16GiB',
        cpu: 4,
        cors: true,
    },
    async (request) => {
        const body = request.data;

        console.log('request made for', body.listing);

        const identifier = getListingIdentifier(body.listing, body.getDescendants, body.deepDescendantSearch);

        let recordSet: RecordSet | null = null;
        try {
            let doc = await firestore
                .collection('searchPings')
                .doc(identifier)
                .get();

            const data = doc.data() as SearchPing;
            if (
                doc.exists &&
                (data.isFinished || new Date().getTime() - data.lastUpdated < 2 * 60 * 1000)
            ) {
                console.log('too recent!');
                return true;
            } else {
                if (doc.exists) {
                    console.log('deleting');
                    await doc
                        .ref
                        .delete();

                    const existingDocs = await firestore
                        .collection('records')
                        .where('searchIdentifier', '==', identifier)
                        .get();
                    await Promise.all(
                        (existingDocs.docs || []).map(e => e.ref.delete()),
                    );

                    console.log('done');
                }

                console.log('sending off');

                recordSet = new RecordSet(identifier);
                await usingCache(() => unrollEtymology(
                    recordSet!,
                    body.listing,
                    body.getDescendants,
                    body.deepDescendantSearch,
                ));

                recordSet.commit();
                await recordSet.awaitAll();

                await doc
                    .ref
                    .update({
                        isFinished: true,
                    });

                return true;
            }
        } catch (e) {
            console.log(e);

            if (recordSet) {
                recordSet.commit();
                await recordSet.awaitAll();
            }

            throw new HttpsError("internal", JSON.stringify(e));
        }
    },
);