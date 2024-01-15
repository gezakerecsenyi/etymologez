import { getListingIdentifier } from '../../src/global/util';
import { DerivationType, DescendantRelationship, EtymologyListing, WordListing } from '../../src/types';
import { getDescendantsFromPage } from './categories';
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

export default async function unrollEtymology(
    recordSet: RecordSet,
    listing: WordListing,
    getDescendants: boolean = false,
    deepDescendantSearch: boolean = false,
    metListings: Set<string> = new Set<string>(),
    markAsComplete: boolean = false,
    backupSourceWord?: WordListing,
) {
    if (!listing) {
        return;
    }

    const listingIdentifier = getListingIdentifier(
        listing,
        getDescendants,
        deepDescendantSearch,
    );
    const existingResults = await RecordSet.getPrecomputedRecords(listingIdentifier);
    if (existingResults.length) {
        await recordSet.add(...existingResults);
        return;
    }

    const listingId = JSON.stringify([
        listing.word,
        listing.language,
    ]);

    if (metListings.has(listingId)) {
        return;
    }

    let id: string | undefined = undefined;
    async function addRecordHere(
        sourceWord: string,
        sourceLanguage: string,
        sourceListing: WordListing,
        relationship: DerivationType | DescendantRelationship,
        isPriorityChoice: boolean,
    ) {
        const [record] = await recordSet.add({
            word: listing.word,
            definition: listing.definition!,
            language: listing.language,
            originWord: sourceWord,
            originDefinition: sourceListing.definition!,
            originLanguage: sourceLanguage,
            relationship,
            parentWordListing: listing,
            isPriorityChoice,
            createdBy: 'parent-function',
        });

        if (getDescendants) {
            metListings.add(listingId);
        }

        await unrollEtymology(
            recordSet,
            sourceListing,
            getDescendants,
            deepDescendantSearch,
            metListings,
            true,
        );

        id = record.id!;
    }

    let offset = 0;
    let etymologyHere: EtymologyListing | undefined;
    do {
        const newEtymology = await populateEtymology(listing, offset);

        if (newEtymology) {
            etymologyHere = newEtymology;

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
        await addRecordHere(
            backupSourceWord.word,
            backupSourceWord.language,
            backupSourceWord,
            DerivationType.ultimately,
            false,
        );
    }

    if (getDescendants) {
        await getDescendantsFromPage(recordSet, listing, metListings, deepDescendantSearch);
        await fetchDescendants(recordSet, listing, metListings, deepDescendantSearch);
    }

    if (id && markAsComplete) {
        recordSet.update(id!, {
            isComplete: true,
            listingIdentifier,
        });
    }
}