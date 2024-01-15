import { v4 } from 'uuid';
import { EtymologyRecord, SearchPing } from '../../src/types';
import { firestore } from './index';

export default class RecordSet {
    public searchIdentifier: string;
    private localChanges: Map<string, EtymologyRecord>;
    private openPromises: Promise<object>[];
    private static maxSize = 200;

    constructor(searchIdentifier: string) {
        this.searchIdentifier = searchIdentifier;
        this.localChanges = new Map();
        this.openPromises = [];

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
                } as SearchPing)
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
                    .set(v),
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
                    ...this.localChanges.get('id')!,
                    ...data,
                },
            );
        } else {
            firestore
                .collection('records')
                .doc(id)
                .update(data)
                .catch(() => {
                    console.log('attempted to update non-existant??');
                });
        }
    }

    async add(...e: EtymologyRecord[]) {
        const corrected: EtymologyRecord[] = e.map(t => {
            const correctedValue = {
                ...Object.assign({}, t),
                word: decodeURIComponent(t.word).replace(/[a-zA-Z_\-:]+\//g, ''),
                sourceWord: decodeURIComponent(t.originWord).replace(/[a-zA-Z_\-:]+\//g, ''),
                searchIdentifier: this.searchIdentifier,
                id: v4(),
            };

            if (correctedValue.parentWordListing?.etymology) {
                correctedValue.parentWordListing.etymology.fromEtymologyListing = undefined;
            }

            return correctedValue;
        });

        corrected.forEach(e => {
            this.localChanges.set(e.id!, e);
        });

        if (this.localChanges.size % RecordSet.maxSize === 10) {
            this.commit();
        }

        return corrected;
    }
}