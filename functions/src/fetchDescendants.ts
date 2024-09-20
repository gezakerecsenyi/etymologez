import { getListingCacheKey } from '../../src/global/util';
import { DescendantRelationship, EtymologyRecord, SectionWikitext, WordListing } from '../../src/types';
import { fetchWiktionaryData } from './cache';
import { getDescendantsFromPage } from './categories';
import { languageNameLookup } from './data';
import log from './debug';
import { getRelevantListing } from './getRelevantListing';
import getWordData from './getWordData';
import populateEtymology from './populateEtymology';
import RecordSet from './RecordSet';
import { SearchOptions, wikidataDescendantTagMap } from './unrollEtymology';
import { parseWikitextWord } from './util';

export async function fetchDescendants(
    recordSet: RecordSet,
    listing: WordListing,
    metListings: Set<string>,
    searchOptions: SearchOptions
) {
    if (!listing?.descendantsSectionHeads) {
        return;
    }

    log('fetchdescendants for', listing.word);

    await Promise.allSettled(
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
                        const options = t.filter(e => !e.includes('='))
                        return parseWikitextWord(t, options[2] || options[3]);
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
                        originWord: listing.word,
                        originLanguage: listing.language,
                        originDefinition: listing.definition,
                        parentWord: getWord(line[1]),
                        parentLanguage: getLanguage(line[1]),
                        relationship: DescendantRelationship.inherited,
                        isPriorityChoice: false,
                        createdBy: 'fetch-descendants',
                    };

                    if (line[0] > 1) {
                        const lastHigher = lines
                            .slice(0, i)
                            .reverse()
                            .find(e => e[0] === line[0] - 1);

                        if (lastHigher) {
                            recordHere.originWord = getWord(lastHigher[1]);
                            recordHere.originLanguage = getLanguage(lastHigher[1]);
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
                        recordHere.parentWord,
                        recordHere.parentLanguage,
                    );

                    const [relevantListing, isPriorityChoice] = getRelevantListing(
                        wordData?.listings || [],
                        undefined,
                        listing,
                        gloss,
                    );

                    if (relevantListing) {
                        recordHere.isPriorityChoice = isPriorityChoice;
                        recordHere.parentWordListing = relevantListing;
                        recordHere.parentWordListing.etymology = await populateEtymology(relevantListing) || undefined;

                        recordHere.parentDefinition = relevantListing.definition;
                    }

                    recordSet.add(recordHere);

                    if (relevantListing && searchOptions.deepDescendantSearch) {
                        const listingId = getListingCacheKey(relevantListing);
                        if (!metListings.has(listingId)) {
                            metListings.add(listingId);

                            await getDescendantsFromPage(
                                recordSet,
                                relevantListing,
                                metListings,
                                searchOptions,
                            );
                            await fetchDescendants(
                                recordSet,
                                relevantListing,
                                metListings,
                                searchOptions,
                            );
                        }
                    }
                }
            }),
    );
}