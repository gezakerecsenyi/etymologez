import { cleanWord, getListingCacheKey, getListingIdentifier } from '../../src/global/util';
import { DerivationType, DescendantRelationship, EtymologyListing, WordListing } from '../../src/types';
import { getDescendantsFromPage } from './categories';
import log from './debug';
import { fetchDescendants } from './fetchDescendants';
import { getRelevantListing } from './getRelevantListing';
import getWordData from './getWordData';
import populateEtymology from './populateEtymology';
import RecordSet from './RecordSet';

export const wikidataDescendantTagMap = new Map(Object.entries({
    bor: DescendantRelationship.borrowed,
    lbor: DescendantRelationship.learnedBorrowing,
    slb: DescendantRelationship.semiLearnedBorrowing,
    clq: DescendantRelationship.calque,
    pclq: DescendantRelationship.partialCalque,
    sml: DescendantRelationship.semanticLoan,
    translit: DescendantRelationship.transliteration,
    der: DescendantRelationship.derivative,
}));

export interface SearchOptions {
    getDescendants: boolean;
    deepDescendantSearch: boolean;
    depthFirst: boolean;
}

export default async function unrollEtymology(
    recordSet: RecordSet,
    listing: WordListing,
    searchOptions: SearchOptions,
    metListings: Set<string> = new Set<string>(),
    backupSourceWord?: WordListing,
) {
    if (!listing) {
        return;
    }

    log('unrolling', listing.word);

    const listingIdentifier = getListingIdentifier(
        listing,
        searchOptions.getDescendants,
        searchOptions.deepDescendantSearch,
    );
    const existingResults = await RecordSet.getPrecomputedRecords(listingIdentifier);
    if (existingResults.length) {
        recordSet.add(...existingResults.filter(e => e.searchIdentifier !== recordSet.searchIdentifier));
        return;
    }

    const listingId = getListingCacheKey(listing);
    if (metListings.has(listingId)) {
        return;
    }

    let id: string | undefined = undefined;

    const promiseList: Promise<void>[] = [];
    async function addRecordHere(
        originWord: string,
        originLanguage: string,
        originListing: WordListing,
        relationship: DerivationType | DescendantRelationship,
        isPriorityChoice: boolean,
        isFromBackup: boolean = false,
    ) {
        const [record] = recordSet.add({
            parentWord: cleanWord(listing.word),
            parentDefinition: listing.definition!,
            parentLanguage: listing.language,
            originWord: cleanWord(originWord),
            originDefinition: originListing.definition!,
            originLanguage: originLanguage,
            relationship,
            parentWordListing: listing,
            isPriorityChoice,
            createdBy: 'parent-function',
            isBackupChoice: isFromBackup,
        });

        if (searchOptions.getDescendants) {
            metListings.add(listingId);
        }

        const promiseHere = unrollEtymology(recordSet, originListing, searchOptions, metListings);
        if (searchOptions.depthFirst) {
            await promiseHere;
        } else {
            promiseList.push(promiseHere);
        }

        id = record.id!;
    }

    let offset = 0;
    let etymologyHere: EtymologyListing | undefined;
    do {
        const newEtymology = listing.etymology?.fromEtymologyListing && offset === 0 ?
            listing.etymology :
            await populateEtymology(listing, offset);

        if (newEtymology) {
            etymologyHere = newEtymology;
            listing.etymology = etymologyHere;

            if (etymologyHere.fromEtymologyListing) {
                const sources = await getWordData(
                    etymologyHere.fromEtymologyListing.word,
                    etymologyHere.fromEtymologyListing.language,
                );

                const [listingHere, isPriorityChoice] = getRelevantListing(
                    sources.listings,
                    etymologyHere,
                    listing,
                );

                if (listingHere) {
                    await addRecordHere(
                        etymologyHere.fromEtymologyListing.word,
                        etymologyHere.fromEtymologyListing.language,
                        listingHere,
                        etymologyHere.relationship!,
                        isPriorityChoice,
                    );

                    break;
                } else {
                    offset++;
                }
            } else {
                break;
            }
        } else {
            break;
        }
    } while (offset < 10);

    if (!id && backupSourceWord) {
        listing.etymology = {
            language: backupSourceWord.language,
            rawResult: [
                {
                    type: 'string',
                    text: `Ultimately from ${backupSourceWord.language} ${backupSourceWord.word}`,
                },
            ],
            relationship: DerivationType.ultimately,
            word: backupSourceWord.word,
        };

        await addRecordHere(
            backupSourceWord.word,
            backupSourceWord.language,
            backupSourceWord,
            DerivationType.ultimately,
            false,
            true,
        );
    }

    metListings.add(listingId);

    log('now getting descendants');
    if (searchOptions.getDescendants) {
        await getDescendantsFromPage(recordSet, listing, metListings, searchOptions);
        await fetchDescendants(recordSet, listing, metListings, searchOptions);
    }

    log('done getting desc');

    log('promises left:', promiseList.length);

    await Promise.allSettled(promiseList);

    if (id && !searchOptions.depthFirst) {
        recordSet.update(id!, {
            isComplete: true,
            listingIdentifier,
        });
    }
}