import { firestore } from './index';

export default class CacheMap {
    private localChanges: Map<string, object>;

    constructor() {
        this.localChanges = new Map<string, object>();
    }

    set(key: string, value: object) {
        if (!key) {
            return;
        }

        const cleanKey = encodeURIComponent(key);
        this.localChanges.set(cleanKey, value);

        firestore
            .collection('cache')
            .doc(cleanKey)
            .set(value)
            .catch(() => {});
        if (this.localChanges.size >= 1000) {
            this.localChanges = new Map(
                Array.from(this.localChanges.entries()).slice(-600),
            );
        }
    }

    async get(key: string) {
        if (!key) {
            return undefined;
        }

        const cleanKey = encodeURIComponent(key);

        if (this.localChanges.has(cleanKey)) {
            return this.localChanges.get(cleanKey);
        }

        const fbRes = await firestore
            .collection('cache')
            .doc(cleanKey)
            .get();
        if (fbRes.exists) {
            return fbRes.data() as object;
        }

        return undefined;
    }
}