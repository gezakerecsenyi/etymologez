import { Core, ElementDefinition } from 'cytoscape';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import './styles.scss';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import { callGetWordData, callUnrollEtymology } from './getFromAPI';
import { db } from './index';
import processRecords, { LanguageTable } from './processRecords';
import { EtymologyRecord, relationshipCategories, SearchPing, WordListing } from './types';
import { getListingIdentifier, getWiktionaryLabel } from './global/util';
import github from './github.png';

export interface NodeDefinitionData {
    id: string,
    label: string,
    language: string,
    fromWord: WordListing,
}

export interface SearchMeta {
    processingTimeMS: number;
    derivationsObtained: number,
    nodesObtained: number,
    nodesDrawn: number,
    edgesDrawn: number,
    falseRoots: number,
    clashes: number,
    directLength: number,
    timingSegments: number[],
}

function App() {
    const [data, setData] = useState<null | ElementDefinition[]>(null);
    const languageTable = useRef<LanguageTable | null>(null);

    const [hasMadeSearch, setHasMadeSearch] = useState(false);

    const [includeDescendants, setIncludeDescendants] = useState(true);
    const [deepDescendantSearch, setDeepDescendantSearch] = useState(false);

    const [word, setWord] = useState('test');
    const [onlyEnglish, setOnlyEnglish] = useState(true);

    const [loading, setLoading] = useState(false);
    const [listings, setListings] = useState<WordListing[] | null>(null);
    const [listingIndex, setListingIndex] = useState(0);

    const [cy, setCy] = useState<Core | null>(null);

    const [metadata, setMetadata] = useState<SearchMeta | null>(null);
    const [expectListingsAt, setExpectListingsAt] = useState<string | null>(null);

    const purgeFalseRoots = useRef(true);
    const [purgeRootUpdater, setPurgeRootUpdater] = useState(true);
    useEffect(() => {
        purgeFalseRoots.current = purgeRootUpdater;

        if (!loading) {
            setCy(cy);
        }
    }, [purgeRootUpdater]);

    useEffect(() => {
        setListingIndex(0);
    }, [listings]);

    const getListings = useCallback(
        () => {
            setHasMadeSearch(true);
            setListings(null);
            setMetadata(null);
            setData(null);
            setLoading(true);

            callGetWordData(word, onlyEnglish ? 'English' : '', true)
                .then(res => {
                    setLoading(false);
                    setListings(res);
                })
                .catch(() => {
                    setLoading(false);
                });
        },
        [
            word,
            onlyEnglish,
        ],
    );

    const unsubscribe = useRef<null | (() => void)>(null);
    const unsubscriber = useRef<null | (() => void)>(null);
    const shouldUnsubscribe = useRef(false);
    const hasData = useRef(false);
    const unsubscribeFromAll = (polite: boolean = false) => {
        if (polite && !hasData.current) {
            shouldUnsubscribe.current = true;
            return;
        }

        if (unsubscriber.current) {
            unsubscriber.current();
            unsubscriber.current = null;
        }

        if (unsubscribe.current) {
            unsubscribe.current();
            unsubscribe.current = null;
        }

        shouldUnsubscribe.current = false;
        hasData.current = false;
        setIsJustFetching(false);
    };

    const [isJustFetching, setIsJustFetching] = useState(false);
    const generate = useCallback(
        () => {
            if (expectListingsAt || !listings || listingIndex > listings.length) {
                setLoading(false);
                setExpectListingsAt(null);
                return;
            }

            const listing = listings[listingIndex];

            hasData.current = false;
            setLoading(true);
            setData(null);
            setMetadata(null);
            setIsJustFetching(false);
            unsubscribeFromAll();

            const newIdentifier = getListingIdentifier(
                listing,
                includeDescendants,
                deepDescendantSearch,
            );

            getDoc(doc(db, 'searchPings', newIdentifier)).then(doc => {
                if (doc.exists() && (doc.data() as SearchPing).isFinished) {
                    setIsJustFetching(true);
                } else {
                    callUnrollEtymology(listing, includeDescendants, deepDescendantSearch)
                        .catch(() => {
                            setLoading(false);
                            setExpectListingsAt(null);
                            unsubscribeFromAll();
                        });
                }

                setExpectListingsAt(newIdentifier);
            });
        },
        [
            listings,
            listingIndex,
            includeDescendants,
            deepDescendantSearch,
            expectListingsAt,
        ],
    );

    const currentTimeout = useRef<null | number>(null);
    useEffect(() => {
        if (expectListingsAt && listings) {
            unsubscriber.current = onSnapshot(doc(db, 'searchPings', expectListingsAt), (data) => {
                if (data.exists()) {
                    if ((data.data() as SearchPing).isFinished) {
                        setLoading(false);
                        unsubscribeFromAll(true);
                    }
                }
            });

            unsubscribe.current = onSnapshot(
                query(collection(db, 'records'), where('searchIdentifier', '==', expectListingsAt)),
                (q) => {
                    if (currentTimeout.current) {
                        window.clearTimeout(currentTimeout.current);
                    }

                    currentTimeout.current = window.setTimeout(() => {
                        hasData.current = true;

                        const records = q.docs.map(e => e.data() as EtymologyRecord);

                        const res = processRecords(
                            records,
                            listings[listingIndex],
                            purgeFalseRoots.current,
                            languageTable.current,
                        );

                        if (res) {
                            const {
                                elements,
                                languages,
                                metadata,
                            } = res;
                            languageTable.current = languages;
                            setData(elements);
                            setMetadata(metadata);
                        }

                        currentTimeout.current = null;

                        if (shouldUnsubscribe.current) {
                            unsubscribeFromAll();
                        }
                    }, 200);
                },
            );
        } else {
            unsubscribeFromAll();
        }
    }, [expectListingsAt]);

    useEffect(
        () => {
            if (cy && data && languageTable.current) {
                cy.removeAllListeners();

                const nodeData = data.filter(e => e.group === 'nodes');
                const toRemove = cy
                    .elements('node')
                    .filter(n => !nodeData.some(t => t.data.id === n.data('id')));
                cy.remove(toRemove);
                cy.remove(cy.elements('edge'));

                const newNodes = nodeData.filter(e => !cy.getElementById(e.data.id!)?.length);
                cy.add(newNodes);
                cy.add(data.filter(e => e.group === 'edges'));

                cy.style([
                    ...Object.values(languageTable.current),
                    {
                        selector: 'node',
                        style: {
                            'opacity': 0.9,
                        },
                    },
                    {
                        selector: 'edge',
                        style: {
                            'width': 3,
                            'line-color': '#cccccc',
                            'target-arrow-color': '#cccccc',
                            'target-arrow-shape': 'triangle',
                            'curve-style': 'bezier',
                        },
                    },
                    ...relationshipCategories.map(e => ({
                        selector: `edge[category="${e[0]}"]`,
                        style: {
                            'line-style': e[0],
                        },
                    })),
                    {
                        selector: 'node[isSource="yes"]',
                        style: {
                            'border-width': '3px',
                            'border-color': '#0066c2',
                            'background-color': '#697373',
                            'text-outline-color': '#2677bb',
                            'font-weight': 'bold',
                        },
                    },
                    {
                        selector: 'node[isEtymon="yes"]',
                        style: {
                            'font-weight': 'bold',
                        },
                    },
                    {
                        'selector': 'node:selected',
                        'style': {
                            'border-width': '3px',
                            'border-color': '#aad8ff',
                            'background-color': '#697373',
                            'text-outline-color': '#77828c',
                        },
                    },
                ]);

                cy.on('tap', 'node', (e) => {
                    const data = e.target.data() as NodeDefinitionData;

                    setWord(data.label);
                    setOnlyEnglish(false);
                    setListingIndex(0);

                    if (data.fromWord && data.fromWord.word) {
                        setListings([data.fromWord]);
                    } else {
                        setListings([
                            {
                                word: data.label,
                                language: data.language,
                            },
                        ]);
                    }
                });

                const layout = cy.layout({
                    name: 'cose',
                    animate: false,
                    randomize: false,
                });
                layout.run();
            } else if (cy) {
                cy.remove(cy.elements('node'));
                cy.remove(cy.elements('edge'));
            }
        },
        [
            data,
            cy,
        ],
    );

    const [showInfo, setShowInfo] = useState(false);

    return (
        <div className='App'>
            <div className='cytoscape-container'>
                {
                    loading && (
                        isJustFetching ? (
                            <p className='loading fetching'>Found precomputed results - downloading...</p>
                        ) : (
                            <p className='loading'>Loading...</p>
                        )
                    )
                }

                <CytoscapeComponent
                    elements={[]}
                    cy={(cy) => {
                        setCy(cy);
                    }}
                    stylesheet={[]}
                    className='cytoscape'
                />

                <label className='purge-option'>
                    <input
                        type='checkbox'
                        onChange={e => setPurgeRootUpdater(e.currentTarget.checked)}
                        defaultChecked
                    />

                    Purge false roots?&nbsp;

                    <button onClick={() => setShowInfo(!showInfo)}>
                        {showInfo ? 'Hide' : 'Info'}
                    </button>

                    {
                        showInfo && (
                            <div className='info-box'>
                                The generator occasionally returns terms that it for some reason thinks to be descendants of
                                one of your etymons, but for which no direct route can be traced back to your tree. More
                                often than not, this is indicative of an error in the generation, but on occasion,
                                particularly when dealing with poorly-documented trees, pruning all such detached subtrees
                                could remove a lot of otherwise-useful data, especially when only a single link is
                                missing. </div>
                        )
                    }
                </label>

                {
                    metadata && (
                        <div className='metadata'>
                            <p>
                                Nodes: {metadata.nodesDrawn}/{metadata.nodesObtained} drawn
                            </p>
                            <p>
                                Edges: {metadata.edgesDrawn}/{metadata.derivationsObtained} drawn; {metadata.clashes} clashes
                                cleaned
                            </p>
                            <p>
                                Path: {metadata.directLength} long; {metadata.falseRoots} false roots purged
                            </p>
                            <p>
                                Processed {metadata.derivationsObtained} records in {metadata.processingTimeMS || '<1'}ms ({metadata.timingSegments.join('/')})
                            </p>
                        </div>
                    )
                }

                <a
                    className='github-button'
                    href='https://github.com/gezakerecsenyi/etymologez'
                    target='_blank'
                >
                    <img src={github} />
                </a>
            </div>

            <div className='sidebar'>
                <div className='search'>
                    <div className='radio-bar'>
                        <label>
                            Only English senses
                            <input
                                type='radio'
                                name='onlyEnglish'
                                onChange={(e) => setOnlyEnglish(e.currentTarget.checked)}
                                checked={onlyEnglish}
                                disabled={loading}
                            />
                        </label>
                        <label>
                            All languages
                            <input
                                type='radio'
                                name='onlyEnglish'
                                onChange={(e) => setOnlyEnglish(!e.currentTarget.checked)}
                                checked={!onlyEnglish}
                                disabled={loading}
                            />
                        </label>
                    </div>

                    <input
                        type='text'
                        value={word}
                        onInput={e => setWord(e.currentTarget.value)}
                        disabled={loading}
                    />

                    <button
                        onClick={getListings}
                        disabled={loading}
                    >
                        Go
                    </button>
                </div>

                {
                    listings ? (
                            <div className='senses-bar'>
                                <div className='controls'>
                                    {
                                        listings.length > 1 && (
                                            <button
                                                onClick={() => setListingIndex(listingIndex - 1)}
                                                disabled={listingIndex === 0 || loading}
                                            >Back</button>
                                        )
                                    }
                                    <h3>
                                        {listings[listingIndex].language}
                                        {listings.length > 1 && <> ({listingIndex + 1}/{listings.length})</>}
                                    </h3>
                                    {
                                        listings.length > 1 && (
                                            <button
                                                onClick={() => setListingIndex(listingIndex + 1)}
                                                disabled={listingIndex === listings.length - 1 || loading}
                                            >Next</button>
                                        )
                                    }
                                </div>
                                <div className='listing'>
                                    <a
                                        href={`https://en.wiktionary.org/wiki/${
                                            getWiktionaryLabel(
                                                listings[listingIndex].word,
                                                listings[listingIndex].language,
                                                false,
                                                true,
                                            )
                                        }#${listings[listingIndex].language.replace(/ /g, '_')}`}
                                        target='_blank'
                                    >
                                        View on Wiktionary
                                    </a>

                                    <h4>
                                        Etymology
                                    </h4>

                                    {
                                        listings[listingIndex].etymology?.rawResult ? (
                                            <p className='etymology'>
                                                {
                                                    listings[listingIndex]
                                                        .etymology!
                                                        .rawResult!
                                                        .filter(e => !(e.type === 'link' && e.text.trim()
                                                                                             .match(/^\[\d+\]$/g)))
                                                        .map((e, i) => e.type === 'link' ? (
                                                            <a
                                                                href={e.linkTo!}
                                                                target='_blank'
                                                                key={i}
                                                            >
                                                                {e.text}
                                                            </a>
                                                        ) : (
                                                            <span key={i}>
                                                            {e.text}
                                                        </span>
                                                        ))
                                                }
                                            </p>
                                        ) : (
                                            <i className='no-available'>(Etymology listing unavailable)</i>
                                        )
                                    }

                                    <h4>
                                        Definition
                                    </h4>

                                    {
                                        listings[listingIndex].definition ? (
                                            <ol>
                                                {
                                                    listings[listingIndex]
                                                        .definition!
                                                        .filter(e => e.text.trim().length)
                                                        .map((definition, i) => (
                                                            <li key={`${definition.text}_${i}`}>{definition.text}</li>
                                                        ))
                                                }
                                            </ol>
                                        ) : (
                                            <i className='no-available'>(No definition available. Click 'Go' above to
                                                attempt to find details.)</i>
                                        )
                                    }

                                    <button
                                        className='expand'
                                        onClick={generate}
                                    >
                                        {expectListingsAt && loading ? 'Stop loading' : 'Expand this'}
                                    </button>

                                    <div className='search-options'>
                                        <i>Search options</i>

                                        <label>
                                            <input
                                                type='checkbox'
                                                checked={includeDescendants}
                                                disabled={loading}
                                                onChange={e => setIncludeDescendants(e.currentTarget.checked)}
                                            />

                                            Include descendants?
                                        </label>

                                        <label>
                                            <input
                                                type='checkbox'
                                                checked={deepDescendantSearch && includeDescendants}
                                                disabled={!includeDescendants || loading}
                                                onChange={e => setDeepDescendantSearch(e.currentTarget.checked)}
                                            />

                                            Deep descendant search?
                                        </label>
                                    </div>
                                </div>
                            </div>
                        ) :
                        hasMadeSearch && !loading ? (
                            <div className='listing-error'>
                                <h3>
                                    No results here!
                                </h3>
                                <p>
                                    Make sure your term is correctly spelled. Cross-reference with the corresponding
                                    listing on Wiktionary to ensure it can be located.
                                </p>
                                {
                                    onlyEnglish && (
                                        <p>
                                            You are currently searching only English terms. If you are looking for a word
                                            in another language, deselect this option. </p>
                                    )
                                }
                            </div>
                        ) : (
                            <div className='listing-error'>
                                <h3>
                                    Start your search!
                                </h3>
                                <p>
                                    Search for a word in the bar above, then choose one of the options of possible
                                    senses and languages, configure your search options, and hit "Expand this" to begin
                                    the query.
                                </p>
                                <p>
                                    Note that your results <i>will</i> take a while to process. Preliminary results
                                    should appear within a minute, but could continue to load indefinitely depending on
                                    your chosen term and search options.
                                </p>
                            </div>
                        )
                }
            </div>
        </div>
    );
}

export default App;
