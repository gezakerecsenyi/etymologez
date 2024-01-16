import { ElementDefinition, Stylesheet, StylesheetStyle } from 'cytoscape';
import { SearchMeta } from './App';
import { getContrastColor, getRandomColor } from './color';
import { DefinitionSpec, descendantRelationships, EtymologyRecord, relationshipCategories, WordListing } from './types';

export type LanguageTable = {
    [key: string]: Stylesheet;
}

export interface RecordsData {
    elements: ElementDefinition[];
    languages: LanguageTable;
    metadata: SearchMeta;
}

interface ExtendedEtymologyRecord extends EtymologyRecord {
    parentId?: string;
    originId?: string;
}

export default function processRecords(
    q: EtymologyRecord[],
    listing: WordListing,
    purgeFalseRoots: boolean,
    languageTable?: LanguageTable | null,
): RecordsData | null {
    if (!q) {
        return null;
    }

    let metadata: SearchMeta = {
        derivationsObtained: 0,
        directLength: 0,
        edgesDrawn: 0,
        clashes: 0,
        nodesDrawn: 0,
        nodesObtained: 0,
        processingTimeMS: 0,
        timingSegments: [],
    };

    let currentTime = new Date().getTime();

    function pushTimingSegment() {
        const newTime = new Date().getTime();
        metadata.timingSegments.push(newTime - currentTime);

        currentTime = newTime;
    }

    const res = q.filter(e =>
        e.parentWord?.trim()?.replace(/[%/_\-*]/g, '').length &&
        e.parentLanguage &&
        e.originWord?.trim()?.replace(/[%/_\-*]/g, '').length &&
        e.originLanguage,
    ) as ExtendedEtymologyRecord[];
    metadata.derivationsObtained = res.length;

    pushTimingSegment();

    function getNodeId(word: string, language: string, definition?: DefinitionSpec[] | undefined) {
        return `${word}__${language}__${definition?.[0]?.text || '..'}`;
    }

    function getEdgeId(startId: string, endId: string) {
        return `${startId}..-->..${endId}`;
    }

    for (const word of res) {
        word.parentId = getNodeId(word.parentWord, word.parentLanguage);
        word.originId = getNodeId(word.originWord, word.originLanguage);
    }

    for (const word of res) {
        if (!word.parentDefinition && word.parentWordListing?.definition) {
            word.parentDefinition = word.parentWordListing.definition;
        }

        for (const e of res) {
            if (word.originDefinition && word.parentDefinition) {
                break;
            }

            if (!word.parentDefinition) {
                if (e.originId === word.parentId && e.originDefinition) {
                    word.parentDefinition = e.originDefinition;
                } else if (e.parentId === word.parentId && e.parentDefinition) {
                    word.parentDefinition = e.parentDefinition;
                }
            }

            if (!word.originDefinition) {
                if (e.originId === word.originId && e.originDefinition) {
                    word.originDefinition = e.originDefinition;
                } else if (e.parentId === word.originId && e.parentDefinition) {
                    word.originDefinition = e.parentDefinition;
                }
            }
        }
    }

    pushTimingSegment();

    let words = {} as { [key: string]: ElementDefinition };
    let edges = {} as { [key: string]: ElementDefinition };
    const languages = languageTable || {} as { [key: string]: StylesheetStyle };

    for (const term of res) {
        const termId = getNodeId(term.parentWord, term.parentLanguage, term.parentDefinition);
        const etymonId = getNodeId(term.originWord, term.originLanguage, term.originDefinition);

        if (termId !== etymonId) {
            [
                term.parentLanguage,
                term.originLanguage,
            ].forEach(lang => {
                if (!languages.hasOwnProperty(lang)) {
                    const backgroundColor = getRandomColor();
                    languages[lang] = {
                        selector: `node[language="${lang}"]`,
                        style: {
                            backgroundColor: `rgb(${backgroundColor[0]},${backgroundColor[1]},${backgroundColor[2]})`,
                            color: getContrastColor(...backgroundColor),
                            'text-valign': 'center',
                            'text-halign': 'center',
                            content: 'data(label)',
                            'font-size': '10px',
                        },
                    };
                }
            });

            words[termId] = {
                group: 'nodes',
                data: {
                    ...words[termId]?.data || {},
                    id: termId,
                    label: term.parentWord,
                    language: term.parentLanguage,
                    parentWordListing: {
                        word: term.parentWord,
                        language: term.parentLanguage,
                        definition: term.parentDefinition || term.parentWordListing?.definition,
                        ...words[termId]?.data?.parentWordListing,
                        ...(term.parentWordListing),
                        ...(
                            term.isPriorityChoice ? {} : words[termId]?.data?.parentWordListing
                        ),
                    },
                },
            };

            words[etymonId] = {
                group: 'nodes',
                data: {
                    ...words[etymonId]?.data || {},
                    id: etymonId,
                    label: term.originWord,
                    language: term.originLanguage,
                    parentWordListing: words[etymonId]?.data?.parentWordListing || {
                        word: term.originWord,
                        language: term.originLanguage,
                        definition: term.originDefinition,
                    } as WordListing,
                },
            };

            const edgeId = getEdgeId(termId, etymonId);
            edges[edgeId] = {
                group: 'edges',
                data: {
                    source: etymonId,
                    target: termId,
                    label: term.relationship,
                    relationship: term.relationship,
                    id: edgeId,
                },
            };
        }
    }

    pushTimingSegment();

    const sourceId = getNodeId(listing.word, listing.language, listing.definition);
    let edgeData = Object
        .values(edges)
        .map(edge => ({
            ...edge,
            data: {
                ...edge.data,
                category: relationshipCategories.find(e => e[1].includes(edge.data.relationship))![0],
            },
        } as ElementDefinition));

    let searchingForEtymonsOf = sourceId;
    while (searchingForEtymonsOf) {
        const etymon = edgeData.find(e => e.data.target === searchingForEtymonsOf);
        if (etymon) {
            words[etymon.data.source] = {
                ...words[etymon.data.source],
                data: {
                    ...words[etymon.data.source].data,
                    isEtymon: 'yes',
                },
            };
            metadata.directLength++;
            searchingForEtymonsOf = etymon.data.source;
        } else {
            break;
        }
    }

    pushTimingSegment();

    let newNodes = Object.entries(words);
    metadata.nodesObtained = newNodes.length;

    for (const [id] of newNodes) {
        const incomingEdges = edgeData.filter(e => e.data.target === id);
        if (incomingEdges.length > 1) {
            metadata.clashes++;

            let definitiveEdge = incomingEdges[0];
            const nonDerived = incomingEdges.filter(e => !descendantRelationships.includes(e.data.relationship));
            if (nonDerived.length) {
                definitiveEdge = nonDerived[0];
            }

            edgeData = edgeData.filter(
                e => e.data.target !== id || e.data.source === definitiveEdge.data.source,
            );
        }
    }

    pushTimingSegment();

    if (purgeFalseRoots) {
        const nodesToProcess = new Set<string>([sourceId]);
        const processedNodes = new Set<string>([sourceId]);
        const edgeMap = new Map(edgeData.map(e => [
            e.data.id!,
            e,
        ]));

        while (nodesToProcess.size) {
            const nodesHere = Array.from(nodesToProcess);
            const edgesHere = Array.from(edgeMap.entries());

            for (const node of nodesHere) {
                nodesToProcess.delete(node);

                for (const [edgeId, edge] of edgesHere) {
                    let isFound: string | null = null;
                    if (edge.data.source === node) {
                        isFound = edge.data.target;
                    } else if (edge.data.target === node) {
                        isFound = edge.data.source;
                    }

                    if (isFound) {
                        edgeMap.delete(edgeId);

                        if (!processedNodes.has(isFound)) {
                            nodesToProcess.add(isFound);
                            processedNodes.add(isFound);
                        }
                    }
                }
            }
        }

        newNodes = newNodes.filter(e => processedNodes.has(e[0]));
        edgeData = edgeData.filter(e => !edgeMap.has(e.data.id!));
    }

    pushTimingSegment();

    const nodeData = newNodes.map(e => ({
        ...e[1],
        removed: false,
        selected: false,
        selectable: true,
        locked: false,
        grabbed: false,
        grabbable: true,
        data: {
            ...e[1].data,
            isSource: e[1].data.id === sourceId ? 'yes' : '',
        },
    }));

    pushTimingSegment();

    metadata.edgesDrawn = edgeData.length;
    metadata.nodesDrawn = nodeData.length;

    metadata.processingTimeMS = metadata.timingSegments.reduce((a, e) => a + e, 0);

    return {
        metadata,
        elements: [
            ...nodeData,
            ...edgeData,
        ],
        languages,
    };
}