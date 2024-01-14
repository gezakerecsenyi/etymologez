import { getWiktionaryUrl } from '../functions/src/util';

let localCache = new Map<string, object>();
let inBackoff: number = 0;

export async function fetchUrl(url: string): Promise<object> {
    if (localCache.has(url)) {
        return localCache.get(url)!;
    } else {
        let req: Response | undefined = undefined;
        while (!req) {
            let currentTime = new Date().getTime();
            while (inBackoff > currentTime) {
                await new Promise(resolve => {
                    window.setTimeout(resolve, currentTime - inBackoff! + Math.random() * 2000);
                });

                currentTime = new Date().getTime();
            }

            try {
                req = await fetch(url);
            } catch (e) {
                inBackoff = new Date().getTime() + 2000;
            }
        }

        const res = await req!.json();

        localCache.set(url, res);

        return res;
    }
}

export async function fetchWiktionaryUrl(
    word: string,
    prop: 'sections' | 'text' | 'wikitext',
    section?: string,
    languageHint?: string,
): Promise<object> {
    const baseUrl = getWiktionaryUrl(word, prop, section, languageHint);
    const res = await fetchUrl(baseUrl);

    if (res && !res.hasOwnProperty('error')) {
        return res;
    } else {
        return await fetchUrl(
            getWiktionaryUrl(word, prop, section, languageHint, true),
        );
    }
}

export async function usingCache<T extends any>(callback: () => Promise<T>): Promise<T> {
    const storageRes = sessionStorage.getItem('cache');
    if (storageRes) {
        localCache = new Map(Object.entries(JSON.parse(storageRes) || {} as { [key: string]: object }));
    } else {
    }

    const res = await callback();

    const entries = Array.from(localCache.entries());
    let batchSize = entries.length;
    while (batchSize > 1) {
        try {
            sessionStorage.setItem('cache', JSON.stringify(
                Object.fromEntries(
                    entries.slice(0, batchSize),
                ),
            ));
            break;
        } catch (e) {
            batchSize = Math.ceil(batchSize * 0.9);
        }
    }

    return res;
}