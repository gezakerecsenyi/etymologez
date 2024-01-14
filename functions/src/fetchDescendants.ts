import { DescendantRelationship, EtymologyRecord, SectionWikitext, WordListing } from '../../src/types';
import { fetchWiktionaryData } from './cache';
import { languageNameLookup } from './data';
import { getRelevantListing } from './getRelevantListing';
import getWordData from './getWordData';
import { populateEtymology } from './parseEtymology';
import RecordSet from './RecordSet';
import { wikidataDescendantTagMap } from './unrollEtymology';

export async function fetchDescendants(recordSet: RecordSet, listing: WordListing) {
    if (!listing?.descendantsSectionHeads) {
        return;
    }

    await Promise.all(
        listing
            .descendantsSectionHeads
            .map(async head => {
                const responseHere = await fetchWiktionaryData(
                    listing.word,
                    'wikitext',
                    head,
                    listing.language,
                ) as SectionWikitext;

                const lines = responseHere['*']
                    .split('\n')
                    .filter(e => e.replace(/^\** */g, '').match(/^\{\{(desc|l)\|/))
                    .map(e => [
                        e.match(/^\**/g)![0].length,
                        e
                            .replace(/^\** */g, '')
                            .split('{{')[1]
                            .split('}}')[0]
                            .split('|'),
                    ] as [number, string[]])
                    .filter(e => e[0] > 0 && e[1].length >= 2);

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    const getWord = (t: string[]) => {
                        const options = t.filter(e => !e.includes('='));
                        if (options[2]) {
                            return options[2];
                        }

                        if (options[3]) {
                            return options[3];
                        }

                        const transliteration = t.find(e => e.startsWith('tr='));
                        if (transliteration) {
                            return transliteration.replace(/^tr=/g, '').replace(/<[a-z]+>/g, '');
                        }

                        return '[?]';
                    };
                    const getLanguage = (t: string[]) => languageNameLookup.get(t.filter(e => !e.includes('=') && ![
                        'l',
                        'desc',
                    ].includes(e))[0])!;

                    const gloss = line[1]
                        .map(e => e.match(/^t\d*\s*=(.+)$/))
                        .filter(e => e)
                        .map(e => e![1])[0];

                    let recordHere: EtymologyRecord = {
                        sourceWord: listing.word,
                        sourceLanguage: listing.language,
                        word: getWord(line[1]),
                        language: getLanguage(line[1]),
                        relationship: DescendantRelationship.inherited,
                        isPriorityChoice: false,
                    };

                    if (line[0] > 1) {
                        const lastHigher = lines
                            .slice(0, i)
                            .reverse()
                            .find(e => e[0] === line[0] - 1);

                        if (lastHigher) {
                            recordHere.sourceWord = getWord(lastHigher[1]);
                            recordHere.sourceLanguage = getLanguage(lastHigher[1]);
                        }
                    }

                    for (const component of line[1]) {
                        if (component.match(/= ?1$/)) {
                            const tag = component.replace(/\d? ?= ?1$/, '');

                            if (wikidataDescendantTagMap.has(tag)) {
                                recordHere.relationship = wikidataDescendantTagMap.get(tag)!;
                                break;
                            }
                        }
                    }

                    const wordData = await getWordData(
                        recordHere.word,
                        recordHere.language,
                    );

                    const [relevantListing, isPriorityChoice] = getRelevantListing(
                        wordData?.listings || [],
                        undefined,
                        listing,
                        gloss,
                    );

                    if (relevantListing) {
                        recordHere.isPriorityChoice = isPriorityChoice;
                        recordHere.fromWord = relevantListing;
                        recordHere.fromWord!.etymology = await populateEtymology(
                            relevantListing,
                        ) || undefined;
                    }

                    await recordSet.add(recordHere);

                    if (relevantListing) {
                        await fetchDescendants(recordSet, relevantListing);
                    }
                }
            }),
    );
}