import { CategoryDump, DescendantRelationship, SectionHTML, SectionWikitext, WordListing } from '../../src/types';
import { fetchUrl, fetchWiktionaryData } from './cache';
import log from './debug';
import { getRelevantListing } from './getRelevantListing';
import getWordData from './getWordData';
import RecordSet from './RecordSet';
import unrollEtymology from './unrollEtymology';
import { chunks } from './util';

export async function flattenCategoryLeaves(
    categoryUrl: string,
    urlIsId: boolean = false,
    pageName?: string,
    visited: string[] = [],
): Promise<[string, string][]> {
    let url = `https://en.wiktionary.org/w/api.php?origin=*&action=query&format=json&list=categorymembers&`;
    if (urlIsId) {
        url += `cmpageid=${categoryUrl}`;
    } else {
        url += `cmtitle=${decodeURIComponent(categoryUrl)}`;
    }

    if (visited.includes(url)) {
        return [];
    }

    let pagesHere: [string, string][] = [];
    const res = await fetchUrl(url) as CategoryDump;
    for (let leaf of res.query.categorymembers) {
        if (!leaf.title.startsWith('Category:')) {
            pagesHere.push([
                pageName?.match(/((?:[A-ZÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ-]* ){0,3})terms/)?.[1].trim() || '',
                decodeURIComponent(leaf.title),
            ]);
        } else {
            pagesHere.push(
                ...await flattenCategoryLeaves(
                    leaf.pageid.toString(),
                    true,
                    leaf.title,
                    [
                        ...visited,
                        url,
                    ],
                ),
            );
        }
    }

    return pagesHere;
}

export async function getDescendantsFromPage(
    recordSet: RecordSet,
    listing: WordListing,
    metListings: Set<string>,
    deepDescendantSearch?: boolean,
) {
    if (!listing?.descendantsSectionHeads) {
        return;
    }

    log('getting from page');
    log('to do:', listing.descendantsSectionHeads);

    await Promise.allSettled(
        listing
            .descendantsSectionHeads
            .map(async head => {
                console.log('getting', head);

                const wikiTextHere = await fetchWiktionaryData(
                    listing.word,
                    'wikitext',
                    head,
                    listing.language,
                ) as SectionWikitext;
                if (wikiTextHere?.['*'].includes('{{rootsee}}')) {
                    const htmlHere = await fetchWiktionaryData(
                        listing.word,
                        'text',
                        head,
                        listing.language,
                    ) as SectionHTML;
                    if (!htmlHere) {
                        return;
                    }

                    const relevantDiv = htmlHere['*'].getElementsByClassName('derivedterms')[0];
                    if (!relevantDiv) {
                        return;
                    }

                    const anchor = relevantDiv.getElementsByTagName('a')[0];
                    if (!anchor) {
                        return;
                    }

                    const categoryUrl = anchor.href.split('/wiki/')[1];
                    if (!categoryUrl) {
                        return;
                    }
                    const leaves = await flattenCategoryLeaves(categoryUrl);

                    for (const chunk of chunks(leaves, 100)) {
                        await Promise.allSettled(
                            chunk.map(async leaf => {
                                const wordHere = await getWordData(
                                    leaf[1],
                                    leaf[0] || undefined,
                                );

                                const [relevantListing] = getRelevantListing(
                                    wordHere.listings,
                                    undefined,
                                    listing,
                                );

                                if (relevantListing) {
                                    recordSet.add(
                                        {
                                            createdBy: 'categories-backup',
                                            isPriorityChoice: false,
                                            isBackupChoice: true,
                                            originLanguage: listing.language,
                                            originWord: listing.word,
                                            originDefinition: listing.definition,
                                            parentLanguage: relevantListing.language,
                                            parentWord: relevantListing.word,
                                            parentDefinition: relevantListing.definition,
                                            parentWordListing: relevantListing,
                                            relationship: DescendantRelationship.inherited,
                                        }
                                    );

                                    await unrollEtymology(
                                        recordSet,
                                        relevantListing,
                                        deepDescendantSearch,
                                        deepDescendantSearch,
                                        metListings,
                                        listing,
                                    );
                                }
                            }),
                        );
                    }
                }
            }),
    );
}