import { getWiktionaryLabel } from '../../src/global/util';
import { stopWords } from './data';

export function* chunks<T extends any>(array: T[], n: number): Generator<T[]> {
    for (let i = 0; i < array.length; i += n) {
        yield array.slice(i, i + n);
    }
}

export function getContentWords(input: string, normalize?: boolean): string[] {
    let words = input
        .split(' ')
        .map(e => e.replace(/[,."'!?]+$/g, ''))
        .filter(e => e);
    if (normalize) {
        words = words.map(e => e.replace(/(ed|ing|es)$/g, ''));
    }

    const filtered = words.filter(e => !stopWords.includes(e));

    return filtered.length ? filtered : words;
}

export function jaccardSimilarity(input1: string, input2: string, normalize?: boolean) {
    const words1 = getContentWords(input1, normalize);
    const words2 = getContentWords(input2, normalize);

    const intersectionLength = words1.filter(t => words2.includes(t)).length;
    return intersectionLength / (words1.length + words2.length - intersectionLength);
}

export function getWiktionaryUrl(
    word: string,
    prop: string,
    section?: string,
    languageHint?: string,
    aggressive?: boolean,
) {
    return `https://en.wiktionary.org/w/api.php?origin=*&redirects=1&action=parse&page=${getWiktionaryLabel(
        word,
        languageHint,
        aggressive,
    )}&prop=${prop}${section !== undefined ?
        `&section=${section}` :
        ''}&format=json`;
}