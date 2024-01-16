import { WordListing } from '../types';
import { diacritics } from './data';

export function getListingCacheKey(listing: WordListing) {
    if (!listing) {
        return '0';
    }

    return `${listing.word}_${listing.language.slice(0, 3)}_${listing.definition?.[0]?.text.slice(0, 5) || ''}`
}

export function getListingIdentifier(listing: WordListing, getDescendants: boolean, deepDescendantSearch: boolean) {
    return `${getDescendants ? 1 : 0}${deepDescendantSearch ? 1 : 0}_${
        encodeURIComponent(
            `${getListingCacheKey(listing)}${listing?.definition?.length}`
        )
    }`;
}

export function normalizeSync(input?: string | null): string {
    if (!input?.length) return input || '';

    return input.replace(/(\S)/g, (_, s: string) => {
        const normalized = diacritics.find(
            n => new RegExp(n.diacritics).test(s),
        );

        return normalized == null ? s : normalized.letter;
    });
}

export function getWiktionaryLabel(
    word: string,
    languageHint?: string,
    aggressive: boolean = false,
    eagerlyCheckProto: boolean = true,
) {
    if (!word) {
        return '';
    }

    let formattedWord = decodeURIComponent(word.trim());
    if (aggressive) {
        formattedWord = normalizeSync(formattedWord).replace(/-/g, '');
    }

    if (word.startsWith('*') && languageHint) {
        formattedWord = `Reconstruction:${languageHint.replace(/ /g, '_')}/${word.slice(1)}`;
    } else if (
        eagerlyCheckProto && languageHint && languageHint.startsWith('Proto-') && !word.startsWith('Reconstruction:')
    ) {
        formattedWord = `Reconstruction:${languageHint.replace(/ /g, '_')}/${word}`;
    }

    return formattedWord;
}

