import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { SearchPing, WordListing } from '../../src/types';
import { getListingIdentifier } from '../../src/global/util';
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

export const callGetWordData = onRequest(
    {
        cors: true,
        timeoutSeconds: 60 * 60,
        memory: '16GiB',
        cpu: 4,
    },
    (request, response) => {
        usingCache(async () => {
            const data = await getWordData(
                request.body.word,
                request.body.language,
            );

            if (request.body.populateEtymologies) {
                return (
                    await Promise.all(data.listings.map(e => populateEtymology(e)))
                ).map((e, i) => ({
                    ...data.listings[i],
                    etymology: e,
                }));
            }

            return data.listings;
        }).then(res => {
            response.send(JSON.stringify(res));
        });
    },
);

export const callUnrollEtymology = onRequest(
    {
        cors: true,
        timeoutSeconds: 60 * 60,
        memory: '16GiB',
        cpu: 4,
    },
    (request, response) => {
        const body = request.body as {
            listing: WordListing,
            getDescendants: boolean,
            deepDescendantSearch: boolean,
        };

        const identifier = getListingIdentifier(body.listing, body.getDescendants, body.deepDescendantSearch);

        firestore
            .collection('searchPings')
            .doc(identifier)
            .get()
            .then(doc => {
                const data = doc.data() as SearchPing;
                if (
                    doc.exists &&
                    (data.isFinished || new Date().getTime() - data.lastUpdated < 2 * 60 * 1000)
                ) {
                    response.sendStatus(210);
                } else {
                    const runQuery = () => {
                        const recordSet = new RecordSet(identifier);
                        usingCache(() => unrollEtymology(
                            recordSet,
                            body.listing,
                            body.getDescendants,
                            body.deepDescendantSearch,
                        )).then(async () => {
                            recordSet.commit();
                            await recordSet.awaitAll();

                            await doc
                                .ref
                                .update({
                                    isFinished: true,
                                });

                            response.sendStatus(200);
                        });
                    };

                    if (doc.exists) {
                        doc
                            .ref
                            .delete()
                            .then(() => {
                                firestore
                                    .collection('records')
                                    .where('searchIdentifier', '==', identifier)
                                    .get()
                                    .then((e) => {
                                        Promise
                                            .all(
                                                e.docs.map(e => e.ref.delete()),
                                            )
                                            .then(() => {
                                                runQuery();
                                            });
                                    });
                            });
                    } else {
                        runQuery();
                    }
                }
            });
    },
);