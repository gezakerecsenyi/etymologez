import { EtymologyListing, PartOfSpeech, WordListing } from '../../src/types';
import { POSSimilarityMap } from './data';
import { jaccardSimilarity } from './util';

export function getRelevantListing(
    listingOptions: WordListing[],
    etymology?: EtymologyListing,
    parentListing?: WordListing,
    gloss?: string,
): [WordListing | null, boolean] {
    if (!listingOptions.length) {
        return [
            null,
            false,
        ];
    }

    if (listingOptions.length === 1) {
        return [
            listingOptions[0],
            true,
        ];
    }

    const scores = Array(listingOptions.length).fill(0) as number[];
    const usingGloss = (gloss || etymology?.statedGloss)?.split(', ') || [
        parentListing?.word,
        parentListing?.definition?.[0].text,
    ].filter(e => e) as string[];
    for (const gloss of usingGloss) {
        const usingPOS: PartOfSpeech | undefined = parentListing?.partOfSpeech || (
            gloss?.startsWith('to ') ?
                'Verb' :
                gloss?.endsWith('ly') ?
                    'Adverb' :
                    gloss?.endsWith('ing') ?
                        'Participle' :
                        gloss?.endsWith('-') ?
                            'Prefix' :
                            gloss?.startsWith('-') ?
                                'Suffix' :
                                undefined
        );

        listingOptions.forEach((option, i) => {
            let scoreHere = 0;

            if (option.definition && gloss) {
                option.definition.forEach(definition => {
                    if (!definition.isInflection) {
                        const definitionScore = jaccardSimilarity(gloss, definition.text);
                        scoreHere += definitionScore;

                        if (definitionScore > 0.9) {
                            scoreHere += 0.5;
                        }

                        scoreHere += 0.5 * jaccardSimilarity(gloss, definition.text, true);
                    }
                });

                scoreHere /= option.definition.length;
            }

            if (usingPOS) {
                if (option.partOfSpeech === usingPOS) {
                    scoreHere *= 1.4;
                } else if (
                    POSSimilarityMap.some(set =>
                        set.includes(usingPOS) &&
                        set.includes(option.partOfSpeech!),
                    )
                ) {
                    scoreHere *= 1.2;
                }
            }

            scores[i] += scoreHere;
        });
    }

    return [
        listingOptions[scores.indexOf(Math.max(...scores))],
        true,
    ] || [
        listingOptions[0] || null,
        false,
    ];
}