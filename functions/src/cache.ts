import { JSDOM } from 'jsdom';
import { getWiktionaryLabel } from '../../src/global/util';
import { AllWiktionaryData, SectionHTML, SectionsData, SectionWikitext } from '../../src/types';
import CacheMap from './CacheMap';
import { getWiktionaryUrl } from './util';

let localCache = new CacheMap();
let inBackoff: number = 0;

export async function fetchUrl(url: string): Promise<object> {
    /*const cacheRes = await localCache.get(url);
    if (cacheRes) {
        return cacheRes;
    } else {
        let req: Response | undefined = undefined;
        while (!req) {
            let currentTime = new Date().getTime();
            while (inBackoff > currentTime) {
                await new Promise(resolve => {
                    setTimeout(resolve, currentTime - inBackoff! + Math.random() * 2000);
                });

                currentTime = new Date().getTime();
            }

            try {
                req = await fetch(url);
            } catch (e) {
                inBackoff = new Date().getTime() + 2000;
            }
        }

        try {
            const res = await req!.json();
            localCache.set(url, res);

            return res;
        } catch (e) {
            return {};
        }
    }*/

    let req: Response | undefined = undefined;
    let attempts = 0;
    while (!req) {
        attempts++;
        if (attempts > 100) {
            throw `Timeout getting ${url}`;
        }

        let currentTime = new Date().getTime();
        while (inBackoff > currentTime) {
            await new Promise(resolve => {
                setTimeout(resolve, currentTime - inBackoff! + Math.random() * 2000);
            });

            currentTime = new Date().getTime();
        }

        try {
            req = await fetch(url);
        } catch (e) {
            inBackoff = new Date().getTime() + 2000;
        }
    }

    try {
        return await req!.json();
    } catch (e) {
        return {};
    }
}

export async function fetchAllWiktionaryData(
    word: string,
    languageHint?: string,
): Promise<AllWiktionaryData> {
    const res = await fetchUrl(
        getWiktionaryUrl(word, 'sections|text|wikitext', undefined, languageHint, false),
    );

    if (res && !res.hasOwnProperty('error')) {
        return res as AllWiktionaryData;
    } else {
        return await fetchUrl(
            getWiktionaryUrl(word, 'sections|text|wikitext', undefined, languageHint, true),
        ) as AllWiktionaryData;
    }
}

export async function fetchWiktionaryData(
    word: string,
    prop: 'sections' | 'text' | 'wikitext',
    section?: string,
    languageHint?: string,
): Promise<SectionHTML | SectionWikitext | SectionsData | null> {
    const cacheKey = getWiktionaryLabel(
        word,
        languageHint,
    );

    const allData = await localCache.get(cacheKey) as AllWiktionaryData || await fetchAllWiktionaryData(
        word,
        languageHint,
    );
    if (allData && allData.parse) {
        localCache.set(cacheKey, allData);

        function getDom() {
            const domHere = new JSDOM(allData.parse.text['*'], {
                url: `https://en.wiktionary.org/wiki/${cacheKey}`,
            }).window.document;

            const base = domHere.createElement('base');
            base.setAttribute('href', `https://en.wiktionary.org/wiki/${cacheKey}`);
            domHere!.head.appendChild(base);

            return domHere;
        }

        if (prop === 'sections') {
            return allData.parse.sections;
        }

        if (section) {
            if (prop === 'text') {
                const domHere = getDom();

                const relevantHead = domHere!.getElementById(
                    allData.parse.sections.find(e => e.index === section)?.anchor || '__',
                );

                if (!relevantHead) {
                    return null;
                }

                const container = domHere!.createElement('div');
                container.className = 'mw-parser-output';

                let currentHead = relevantHead.parentElement;
                if (!currentHead) {
                    return null;
                }

                const children = [currentHead];
                do {
                    children.push(currentHead!);
                    currentHead = currentHead?.nextElementSibling as HTMLElement;
                } while (currentHead && !currentHead.nodeName.match(/^H[0-6]$/g));

                for (const child of children) {
                    container.appendChild(child);
                }

                domHere!.body.replaceChildren(container);

                return {
                    ['*']: domHere!,
                };
            } else {
                const adaptedIndex = (parseInt(section) || 0) - 1;
                if (adaptedIndex >= 0) {
                    const sectionData = allData
                        .parse
                        .wikitext['*']
                        .split(/(?:\n|^)(=+)([^=\n]+)(\1)/g)
                        .slice(1)
                        .reduce(
                            (a, e, i) => i % 4 ?
                                [
                                    ...a.slice(0, -1),
                                    a.slice(-1)[0] + e,
                                ] :
                                [
                                    ...a,
                                    e,
                                ],
                            [] as string[],
                        )[adaptedIndex];

                    if (sectionData) {
                        return {
                            ['*']: sectionData,
                        };
                    }
                }
            }
        } else {
            if (prop === 'text') {
                return {
                    ['*']: getDom(),
                };
            }

            return allData.parse.wikitext;
        }
    }

    return null;
}

export async function usingCache<T extends any>(callback: () => Promise<T>): Promise<T> {
    localCache = new CacheMap();
    return await callback();
}