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
        e.word?.trim()?.replace(/[%/_\-*]/g, '').length &&
        e.language &&
        e.sourceWord?.trim()?.replace(/[%/_\-*]/g, '').length &&
        e.sourceLanguage,
    );
    metadata.derivationsObtained = res.length;

    pushTimingSegment();

    let words = {} as { [key: string]: ElementDefinition };
    let edges = {} as { [key: string]: ElementDefinition };
    const languages = languageTable || {} as { [key: string]: StylesheetStyle };

    function getNodeId(word: string, language: string, definition: DefinitionSpec[] | undefined) {
        return `${word}__${language}`;
    }

    function getEdgeId(startId: string, endId: string) {
        return `${startId}..-->..${endId}`;
    }

    for (const term of res) {
        const termId = getNodeId(term.word, term.language, term.definition);
        const etymonId = getNodeId(term.sourceWord, term.sourceLanguage, term.sourceDefinition);

        if (termId !== etymonId) {
            [
                term.language,
                term.sourceLanguage,
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
                    label: term.word,
                    language: term.language,
                    fromWord: {
                        ...words[termId]?.data?.fromWord,
                        ...(
                            (term.isPriorityChoice && term.fromWord) ?
                                term.fromWord :
                                {
                                    word: term.word,
                                    language: term.language,
                                    definition: term.definition,
                                } as WordListing
                        ),
                    },
                },
            };

            words[etymonId] = {
                group: 'nodes',
                data: {
                    ...words[etymonId]?.data || {},
                    id: etymonId,
                    label: term.sourceWord,
                    language: term.sourceLanguage,
                    isPriority: term.isPriorityChoice,
                    fromWord: words[etymonId]?.data?.fromWord || {
                        word: term.sourceWord,
                        language: term.sourceLanguage,
                        definition: term.sourceDefinition,
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

    metadata.nodesObtained = Object.keys(words).length;

    const sourceId = getNodeId(listing.word, listing.language, listing.definition);
    let edgeData = Object
        .values(edges)
        .map(edge => ({
            ...edge,
            data: {
                ...edge.data,
                category: relationshipCategories.find(e => e[1].includes(edge.data.relationship))![0]
            }
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
        const edgeMap = new Map(edgeData.map(e => [e.data.id!, e]));

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