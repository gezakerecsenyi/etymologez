import {
    DerivationType,
    EtymologyListing,
    LinkSearchRes,
    SectionHTML,
    StringBreakdown,
    WordListing,
} from '../../src/types';
import { fetchWiktionaryData } from './cache';
import { getRelevantListing } from './getRelevantListing';
import getWordData from './getWordData';

const derivationTypes = [
    DerivationType.ultimately,
    DerivationType.inherited,
    DerivationType.clipping,
    DerivationType.borrowed,
    DerivationType.variant,
    DerivationType.borrowingOf,
    DerivationType.borrowingFrom,
    DerivationType.formOf,
    DerivationType.from,
    DerivationType.via,
    DerivationType.root,
    DerivationType.of,
    DerivationType.asIf,
    DerivationType.inflection,
    DerivationType.compound,
    DerivationType.calque,
];
const derivationTypesRegexp = derivationTypes
    .map(e => `[${e[0].toLowerCase()}${e[0].toUpperCase()}]${e.slice(1).toLowerCase()}`)
    .join('|');

export function parseEtymology(etymologyEntries: StringBreakdown[], offset?: number): EtymologyListing | null {
    const isBadLink = (e: StringBreakdown) => {
        if (e.type === 'string') {
            return false;
        }

        const url = new URL(e.linkTo!);
        if (url.hostname.includes('wikipedia.org')) {
            return true;
        }

        const split = url.pathname.split(':');
        if (split.length > 1 && !split[0].endsWith('Reconstruction')) {
            return true;
        }

        return false;
    };

    const mergeStrings = (q: StringBreakdown[]) => q.reduce(
        (a, e) => a.length && a.slice(-1)[0].type === 'string' && e.type === 'string' ?
            [
                ...a.slice(0, -1),
                {
                    type: 'string',
                    text: `${a.slice(-1)[0].text} ${e.text}`,
                } as StringBreakdown,
            ] :
            [
                ...a,
                e,
            ],
        [] as StringBreakdown[],
    );

    const cleanedUnits = mergeStrings(
        etymologyEntries
            .map(e => ({
                type: e.type,
                text: e.text.trim(),
                linkTo: e.linkTo,
            }) as StringBreakdown)
            .filter(e => e.text)
            .map(e => {
                if (isBadLink(e)) {
                    return {
                        type: 'string',
                        text: e.text,
                    } as StringBreakdown;
                } else {
                    return e;
                }
            }),
    );

    const keepMap = Array(cleanedUnits.length).fill(true) as boolean[];
    cleanedUnits.forEach((segment, i) => {
        if (segment.type === 'link' || i === 0 || !keepMap[i]) {
            return;
        }

        if (segment.text.includes('+') && cleanedUnits[i - 1] && cleanedUnits[i - 1].type === 'link') {
            const sectionHere = [
                i - 1,
                i,
            ];
            for (let iHere = i + 1; iHere < cleanedUnits.length; iHere++) {
                const segmentHere = cleanedUnits[iHere];

                if (
                    segmentHere.type === 'link' &&
                    cleanedUnits[iHere - 1].type === 'string' &&
                    !cleanedUnits[iHere - 1].text.includes('+')
                ) {
                    break;
                } else {
                    sectionHere.push(iHere);
                }
            }

            const linkSections = sectionHere.filter(e => cleanedUnits[e].type === 'link');
            let relevantSection = linkSections
                .filter(e =>
                    !cleanedUnits[e].text.trim().endsWith('-') &&
                    !cleanedUnits[e].text.trim().match(/^\*?-/g),
                )
                .slice(-1)[0];

            if (relevantSection === undefined) {
                relevantSection = linkSections.filter(e =>
                    cleanedUnits[e + 1]?.type === 'string' &&
                    cleanedUnits[e + 1]?.text.trim().match(/^\(["'“‘]/g),
                )[0];
            }

            if (relevantSection === undefined) {
                relevantSection = linkSections.slice(-1)[0];
            }

            if (relevantSection !== undefined) {
                sectionHere.forEach(i => {
                    if (i !== relevantSection) {
                        keepMap[i] = false;
                    }
                });
            }
        }
    });

    const functionalUnits = mergeStrings(
        cleanedUnits
            .filter((_, i) => keepMap[i])
            .map(e => e.type === 'string' ?
                {
                    type: 'string',
                    text: e.text.replace(/ *\(["'“‘][^”"'’]+[”"'’]\) */g, ' '),
                    offeredGloss: e.text.match(/^ *\(["'“‘]([^”"'’]+)[”"'’]\) */)?.[1],
                } as StringBreakdown :
                e,
            )
            .filter(e => e.text),
    );

    function getLinksFollowing(source: StringBreakdown[], regexp: string) {
        return source
            .map(
                (e, i) => [
                    e,
                    e.type === 'link' &&
                    source[i - 1] &&
                    source[i - 1].type === 'string' &&
                    source[i - 1].text.trim().match(new RegExp(`${regexp}$`)),
                    i,
                ],
            )
            .filter(e => e[1]) as LinkSearchRes[];
    }

    let searchSpace = functionalUnits;
    let currentOffset = 0;
    let language!: string;
    let relationship!: DerivationType;
    let currentMatch: LinkSearchRes | undefined;
    let statedGloss: string | undefined = undefined;
    let phase = 0;
    do {
        let urlParse: URL;
        if (phase === 0) {
            if (functionalUnits.length === 1) {
                if (functionalUnits[0].type !== 'link') {
                    return null;
                }

                currentMatch = [
                    functionalUnits[0],
                    [DerivationType.compound],
                    0,
                ];
                relationship = DerivationType.compound;
                urlParse = new URL(functionalUnits[0].linkTo!);
            } else {
                currentMatch = getLinksFollowing(
                    searchSpace,
                    `(${derivationTypesRegexp})(?: the)?((?: [A-ZÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ-]*){0,3})`,
                )[0];

                if (!currentMatch) {
                    return null;
                }

                relationship = currentMatch[1][1]?.trim().toLowerCase() as DerivationType;
                language = currentMatch[1][2]?.trim();
                urlParse = new URL(currentMatch[0].linkTo!);

                phase = 1;
            }
        } else {
            if (language && relationship) {
                currentMatch = getLinksFollowing(
                    searchSpace,
                    `(?:or|[\\/,])\\s*`,
                )[0];

                if (!currentMatch || currentMatch[2] !== 0) {
                    phase = 0;
                    continue;
                }

                urlParse = new URL(currentMatch[0].linkTo!);
            } else {
                return null;
            }
        }

        if (currentMatch) {
            statedGloss = searchSpace[currentMatch[2] + 1]?.containedGloss;

            if (!statedGloss) {
                let currentIndex = currentMatch[2] + 2;
                let currentItem = searchSpace[currentIndex];
                while (currentItem && currentItem.type) {
                    if (currentItem.type === 'string') {
                        if (!currentItem.text.match(/(^|[) ])(or|[\/,])\s*$/g)) {
                            statedGloss = currentItem.containedGloss;
                            break;
                        } else {
                            if (currentItem.containedGloss && !statedGloss) {
                                statedGloss = currentItem.containedGloss;
                                break;
                            }
                        }
                    }

                    currentIndex++;
                    currentItem = searchSpace[currentIndex];
                }
            }
        } else {
            statedGloss = undefined;
        }

        searchSpace = searchSpace.slice(currentMatch[2] + 1);

        language = (
            urlParse.hash ?
                urlParse.hash.slice(1).replace(/_/g, ' ') :
                urlParse.pathname.includes('Reconstruction:') ?
                    urlParse.pathname.split('Reconstruction:')[1].split('/')[0].replace(/_/g, ' ') :
                    language
        ) || language;

        if (currentOffset === offset || offset === undefined) {
            if (urlParse.pathname.startsWith('/wiki/')) {
                return {
                    language: language,
                    word: urlParse.pathname.replace(/^\/wiki\//g, ''),
                    relationship,
                    statedGloss,
                };
            } else if (urlParse.pathname.endsWith('/index.php')) {
                const value = urlParse.searchParams.get('title');

                if (value) {
                    return {
                        language,
                        word: value,
                        relationship,
                        statedGloss,
                    };
                }
            }
        } else {
            currentOffset++;
        }
    } while (currentOffset <= (offset || 0));

    return null;
}

export async function populateEtymology(listing: WordListing, offset?: number): Promise<EtymologyListing | null> {
    if (!listing) {
        return null;
    }

    const basicResult = {
        word: listing.word,
        language: listing.language,
    } as EtymologyListing;

    if (!listing.etymologySectionHead) {
        const inflectionDef = listing.definition?.find(e => e.isInflection);

        if (inflectionDef && inflectionDef.inflectionOf !== listing.word) {
            const wordData = await getWordData(inflectionDef.inflectionOf!, listing.language);
            const [relevantListing] = getRelevantListing(
                wordData.listings,
                listing.etymology,
                listing,
            );
            const fromWord = await populateEtymology(relevantListing!);

            return {
                word: listing.word,
                rawResult: inflectionDef.inflectionOf ? [
                    {
                        type: 'string',
                        text: `Inflection of ${listing.language} ${inflectionDef.inflectionOf}`,
                    },
                ] : undefined,
                language: listing.language,
                relationship: DerivationType.inflection,
                fromWord: fromWord || undefined,
            };
        } else {
            return basicResult;
        }
    }

    const responseHere = await fetchWiktionaryData(
        listing.word,
        'text',
        listing.etymologySectionHead,
        listing.language,
    ) as SectionHTML;
    if (!responseHere) {
        return basicResult;
    }

    const parent = responseHere['*'].getElementsByClassName('mw-parser-output')[0];
    let relevantNodes = [] as Element[];
    let foundStart = false;
    for (const child of parent.children) {
        if ([
            'P',
            'UL',
        ].includes(child.nodeName)) {
            relevantNodes.push(child);

            if (!foundStart) {
                foundStart = true;
            }
        } else {
            if (foundStart) {
                break;
            }
        }
    }

    let wholeStringSoFar = [] as StringBreakdown[];
    let currentString = '';
    let inLink = false;
    let linkTo = '';
    let linkLevel = -1;

    function traverseText(node: Element | ChildNode, level: number) {
        if (!node.textContent) {
            return;
        }

        function checkIfInLink(preCallback?: () => void) {
            if (node.nodeName === 'A') {
                if (preCallback) {
                    preCallback();
                }

                inLink = true;
                linkTo = (node as HTMLAnchorElement).href!;
                linkLevel = level;

                return true;
            }

            return false;
        }

        if (inLink) {
            if (level > linkLevel) {
                currentString += node.textContent;
            } else {
                wholeStringSoFar.push({
                    type: 'link',
                    text: currentString,
                    linkTo,
                });
                currentString = node.textContent;

                if (!checkIfInLink()) {
                    inLink = false;
                    linkTo = '';
                    linkLevel = -1;
                }
            }
        } else {
            if (!checkIfInLink(() => {
                wholeStringSoFar.push({
                    type: 'string',
                    text: currentString,
                });
                currentString = node.textContent!;
            })) {
                if (node.hasChildNodes() && node.nodeName !== '#text') {
                    for (let child of node.childNodes) {
                        traverseText(child, level + 1);
                    }
                } else {
                    currentString += node.textContent;
                }
            }
        }
    }

    for (const element of relevantNodes) {
        traverseText(element, 0);
    }

    if (inLink) {
        wholeStringSoFar.push({
            type: 'link',
            text: currentString,
            linkTo,
        });
    } else {
        wholeStringSoFar.push({
            type: 'string',
            text: currentString,
        });
    }

    const parsedRes = parseEtymology(wholeStringSoFar, offset);
    if (parsedRes) {
        return {
            word: listing.word,
            rawResult: wholeStringSoFar,
            language: listing.language,
            fromWord: parsedRes,
            relationship: parsedRes.relationship,
        };
    }

    return null;
}