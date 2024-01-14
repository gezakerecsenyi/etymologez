import { fetchWiktionaryData } from './cache';
import { PartOfSpeech, partsOfSpeech, SectionHTML, SectionsData, WordData, WordListing } from '../../src/types';

const descendantTags = [
    'Descendants',
    'Derived terms',
    'Extensions',
];

export default async function getWordData(
    word: string,
    rawLanguage?: string,
): Promise<WordData> {
    const language = rawLanguage?.replace(/_/g, ' ');

    const response = await fetchWiktionaryData(
        word,
        'sections',
        undefined,
        language,
    ) as SectionsData;

    let languageHere = '';
    let listingHere: WordListing | undefined = undefined;

    let allListings = [] as WordListing[];

    const languageIsLegal = () => !language || languageHere === language;

    for (let section of response || []) {
        if (section.toclevel === 1) {
            if (listingHere) {
                allListings.push(listingHere);
            }

            languageHere = section.line;
            listingHere = {
                word,
                language: languageHere,
                definition: [],
            };
        } else if (section.line.startsWith('Etymology')) {
            if (listingHere?.definition?.length) {
                allListings.push(listingHere);
                listingHere = {
                    word,
                    language: languageHere,
                    definition: [],
                };
            }

            if (listingHere && languageIsLegal()) {
                listingHere.etymologySectionHead = section.index;
            }
        } else if (partsOfSpeech.includes(section.line as PartOfSpeech) && languageIsLegal()) {
            if (!listingHere) {
                continue;
            }

            listingHere.partOfSpeech = section.line as PartOfSpeech;

            const responseHere = await fetchWiktionaryData(
                word,
                'text',
                section.index,
                language,
            ) as SectionHTML;

            if (responseHere) {
                const relevantOl = responseHere['*'].getElementsByTagName('ol')[0];
                if (relevantOl) {
                    const children = relevantOl.children;
                    for (const child of children) {
                        if (child.nodeName === 'LI') {
                            for (const element of child.getElementsByTagName('ol')) {
                                element.parentNode?.removeChild(element);
                            }

                            let text = '';
                            let isInflection = false;
                            let inflectionOf: string | undefined = undefined;
                            for (const node of child.childNodes as NodeListOf<HTMLElement>) {
                                if (node.classList?.contains('form-of-definition')) {
                                    isInflection = true;
                                    inflectionOf = node
                                        .getElementsByClassName('form-of-definition-link')[0]
                                        ?.getElementsByTagName('a')[0]
                                        ?.textContent || undefined;

                                    if (!inflectionOf) {
                                        inflectionOf = Array
                                            .from(node.getElementsByTagName('a'))
                                            .slice(-1)[0]
                                            .textContent || undefined;
                                    }

                                    if (!inflectionOf) {
                                        isInflection = false;
                                    }
                                }

                                if (node.textContent) {
                                    text += node.textContent;
                                }
                            }

                            listingHere.definition?.push({
                                text: text.split('\n')[0],
                                isInflection,
                                inflectionOf,
                            });
                        }
                    }
                }
            }
        } else if (listingHere && descendantTags.includes(section.line) && languageIsLegal()) {
            if (listingHere.descendantsSectionHeads) {
                listingHere.descendantsSectionHeads.push(section.index);
            } else {
                listingHere.descendantsSectionHeads = [section.index];
            }
        }
    }

    if (listingHere && languageIsLegal()) {
        allListings.push(listingHere);
    }

    return {
        word,
        listings: allListings
            .filter(e => (!language || e.language === language))
            .sort((a, b) => !!(b.etymologySectionHead?.length) ? 1 : !!(a.etymologySectionHead?.length) ? -1 : 0)
            .map(e => ({
                ...e,
                word: decodeURIComponent(word),
            })),
    };
}