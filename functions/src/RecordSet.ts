import hash from 'object-hash';
import { cleanWord } from '../../src/global/util';
import { EtymologyRecord, SearchPing } from '../../src/types';
import { firestore } from './index';

export default class RecordSet {
    private static maxSize = 40;
    public searchIdentifier: string;
    private localChanges: Map<string, EtymologyRecord>;
    private openPromises: Promise<any>[];
    private currentRecordCount: number;
    private inInitialPhase: boolean;

    constructor(searchIdentifier: string) {
        this.searchIdentifier = searchIdentifier;
        this.localChanges = new Map();
        this.openPromises = [];
        this.currentRecordCount = 0;
        this.inInitialPhase = true;

        this.updatePing();
    }

    static async getPrecomputedRecords(
        identifier: string,
        onlyComplete: boolean = true,
    ) {
        return (
            await firestore
                .collection('records')
                .where('listingIdentifier', '==', identifier)
                .get()
        )
            .docs
            .map(e => e.data() as EtymologyRecord)
            .filter(e => !onlyComplete || e.isComplete);
    }

    updatePing() {
        this.openPromises.push(
            firestore
                .collection('searchPings')
                .doc(this.searchIdentifier)
                .set({
                    id: this.searchIdentifier,
                    lastUpdated: new Date().getTime(),
                } as SearchPing),
        );
    }

    async awaitAll() {
        await Promise.allSettled(this.openPromises);
    }

    commit() {
        this.localChanges.forEach((v, k) => {
            this.openPromises.push(
                firestore
                    .collection('records')
                    .doc(k)
                    .set(v, { merge: true }),
            );
        });

        this.updatePing();
        this.localChanges = new Map();
    }

    update(id: string, data: Partial<EtymologyRecord>) {
        if (this.localChanges.has(id)) {
            this.localChanges.set(
                id,
                {
                    ...this.localChanges.get(id)!,
                    ...data,
                },
            );
        } else {
            this.openPromises.push(
                firestore
                    .collection('records')
                    .doc(id)
                    .set(data, { merge: true })
                    .catch(() => {
                        console.log('attempted to update non-existant??');
                    }),
            );
        }
    }

    add(...e: EtymologyRecord[]) {
        const corrected: EtymologyRecord[] = e.map(t => {
            const correctedValue = {
                ...Object.assign({}, t),
                parentWord: cleanWord(
                    decodeURIComponent(t.parentWord).replace(/[a-zA-Z_\-:]+\//g, '')
                ),
                originWord: cleanWord(
                    decodeURIComponent(t.originWord).replace(/[a-zA-Z_\-:]+\//g, '')
                ),
                searchIdentifier: this.searchIdentifier,
            };

            correctedValue.id = encodeURIComponent(hash(correctedValue, {
                algorithm: 'sha1',
                unorderedObjects: false,
                unorderedSets: false,
                unorderedArrays: false,
                ignoreUnknown: true,
                encoding: 'base64',
            }));

            if (correctedValue.parentWordListing?.etymology) {
                correctedValue.parentWordListing.etymology.fromEtymologyListing = undefined;
            }

            return correctedValue;
        });

        corrected.forEach(e => {
            this.currentRecordCount++;
            this.localChanges.set(e.id!, e);
        });

        if (this.currentRecordCount > RecordSet.maxSize || (this.inInitialPhase && this.currentRecordCount > 10)) {
            this.commit();

            if (this.inInitialPhase) {
                this.inInitialPhase = false;
            } else {
                this.currentRecordCount = 0;
            }
        }

        return corrected;
    }
}