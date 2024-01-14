import { getListingIdentifier } from '../../src/global/util';
import { DescendantRelationship, EtymologyListing, WordListing } from '../../src/types';
import { getDescendantsFromPage } from './categories';
import { fetchDescendants } from './fetchDescendants';
import { getRelevantListing } from './getRelevantListing';
import getWordData from './getWordData';
import { populateEtymology } from './parseEtymology';
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

    let offset = 0;
    let etymologyHere: EtymologyListing | undefined;
    let id: string | undefined = undefined;
    do {
        const newEtymology = await populateEtymology(listing, offset);

        if (newEtymology) {
            etymologyHere = newEtymology;

            if (etymologyHere.fromWord) {
                const sources = await getWordData(
                    etymologyHere.fromWord.word,
                    etymologyHere.fromWord.language,
                );

                const [listingHere, isPriorityChoice] = getRelevantListing(
                    sources.listings,
                    etymologyHere,
                    listing,
                );

                if (listingHere) {
                    const [record] = await recordSet.add({
                        word: listing.word,
                        definition: listing.definition!,
                        language: listing.language,
                        sourceWord: etymologyHere.fromWord.word,
                        sourceDefinition: listingHere.definition!,
                        sourceLanguage: etymologyHere.fromWord.language,
                        relationship: etymologyHere.relationship,
                        fromWord: listing,
                        isPriorityChoice,
                    });

                    if (getDescendants) {
                        metListings.add(listingId);
                    }

                    await unrollEtymology(
                        recordSet,
                        listingHere,
                        getDescendants,
                        deepDescendantSearch,
                        metListings,
                        true,
                    );

                    id = record.id!;

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

    if (getDescendants) {
        await getDescendantsFromPage(recordSet, listing, metListings, deepDescendantSearch);
        await fetchDescendants(recordSet, listing);
    }

    if (id && markAsComplete) {
        recordSet.update(id!, {
            isComplete: true,
            listingIdentifier,
        });
    }
}