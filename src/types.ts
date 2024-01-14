export interface EtymologyListing {
    word: string;
    rawResult?: StringBreakdown[];
    language: string;
    relationship: DerivationType;
    fromWord?: EtymologyListing;
    statedGloss?: string;
}

export interface DefinitionSpec {
    text: string;
    isInflection: boolean;
    inflectionOf?: string;
}

export const partsOfSpeech = [
    'Noun',
    'Verb',
    'Adjective',
    'Adverb',
    'Pronoun',
    'Conjunction',
    'Suffix',
    'Prefix',
    'Infix',
    'Preposition',
    'Particle',
    'Participle',
    'Proper noun',
    'Interjection',
    'Root',
] as const;

export type PartOfSpeech = typeof partsOfSpeech[number];

export interface WordListing {
    word: string;
    definition?: DefinitionSpec[];
    language: string;
    etymology?: EtymologyListing;
    etymologySectionHead?: string;
    descendantsSectionHeads?: string[];
    partOfSpeech?: PartOfSpeech;
}

export interface WordData {
    word: string;
    listings: WordListing[];
}

export interface SectionDatum {
    toclevel: number;
    level: string;
    line: string;
    number: string;
    index: string;
    fromTitle: string;
    byteoffset: number;
    anchor: string;
    linkAnchor: string;
}

export type SectionsData = SectionDatum[];

export interface AllWiktionaryData {
    parse: {
        title: string;
        pageid: number;
        showtoc: string;
        sections: SectionDatum[];
        text: {
            '*': string;
        };
        wikitext: {
            '*': string;
        };
    };
}

export interface SectionHTML {
    '*': Document;
}

export interface SectionWikitext {
    '*': string;
}

export interface StringBreakdown {
    type: 'string' | 'link',
    text: string;
    linkTo?: string;
    containedGloss?: string;
}

export enum DerivationType {
    ultimately = 'ultimately from',
    inherited = 'inherited from',
    clipping = 'clipping of',
    borrowed = 'borrowed from',
    variant = 'variant of',
    borrowingOf = 'borrowing of',
    borrowingFrom = 'borrowing from',
    formOf = 'form of',
    from = 'from',
    via = 'via',
    root = 'root',
    of = 'of',
    asIf = 'as if',
    inflection = 'inflection of',
    compound = 'compound of',
    calque = 'calque of',
}

export type LinkSearchRes = [StringBreakdown, RegExpMatchArray, number];

export enum DescendantRelationship {
    borrowed = 'borrowed',
    learnedBorrowing = 'learned borrowing',
    semiLearnedBorrowing = 'semi-learned borrowing',
    calque = 'calque',
    partialCalque = 'partial calque',
    semanticLoan = 'semantic loan',
    transliteration = 'transliteration',
    derivative = 'reshaped by analogy or addition of morphemes',
    inherited = 'inherited'
}

export interface CategoryDump {
    batchcomplete: string,
    continue: object,
    query: {
        categorymembers: {
            pageid: number,
            ns: number,
            title: string,
        }[],
    }
}

export interface EtymologyRecord {
    id?: string;
    word: string;
    language: string;
    definition?: DefinitionSpec[];
    sourceWord: string;
    sourceLanguage: string;
    sourceDefinition?: DefinitionSpec[];
    relationship?: DerivationType | DescendantRelationship;
    fromWord?: WordListing;
    searchIdentifier?: string;
    isComplete?: boolean;
    listingIdentifier?: string;
    isPriorityChoice: boolean;
}

export interface SearchPing {
    id: string;
    lastUpdated: number;
    isFinished?: boolean;
}

export const descendantRelationships = [
    DescendantRelationship.borrowed,
    DescendantRelationship.learnedBorrowing,
    DescendantRelationship.semiLearnedBorrowing,
    DescendantRelationship.calque,
    DescendantRelationship.partialCalque,
    DescendantRelationship.semanticLoan,
    DescendantRelationship.transliteration,
    DescendantRelationship.derivative,
    DescendantRelationship.inherited,
];

export const relationshipCategories: ['solid' | 'dotted' | 'dashed' | 'double', (DescendantRelationship | DerivationType)[]][] = [
    [
        'solid',
        [
            DescendantRelationship.inherited,
            DescendantRelationship.borrowed,
            DerivationType.inherited,
            DerivationType.borrowingOf,
            DerivationType.borrowed,
            DerivationType.borrowingFrom,
            DerivationType.from,

            DerivationType.of,
            DerivationType.root,
        ]
    ],
    [
        'dashed',
        [
            DescendantRelationship.learnedBorrowing,
            DescendantRelationship.semiLearnedBorrowing,
            DescendantRelationship.partialCalque,
            DescendantRelationship.transliteration,
            DescendantRelationship.semanticLoan,
            DescendantRelationship.calque,
            DerivationType.calque,
            DerivationType.asIf,
        ]
    ],
    [
        'double',
        [
            DescendantRelationship.derivative,
            DerivationType.formOf,
            DerivationType.inflection,
            DerivationType.compound,
            DerivationType.variant,
            DerivationType.clipping,
        ]
    ],
    [
        'dotted',
        [
            DerivationType.via,
            DerivationType.ultimately,
        ],
    ]
];