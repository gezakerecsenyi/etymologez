import { Stylesheet } from 'cytoscape';
import { LanguageTable } from './processRecords';
import { relationshipCategories } from './types';

export default function getCytoscapeStylesheet(languageTable: LanguageTable): Stylesheet[] {
    return [
        ...Object.values(languageTable),
        {
            selector: 'node',
            style: {
                'opacity': 0.9,
            },
        },
        {
            selector: 'node:parent',
            style: {
                'background-opacity': 0,
                'border-opacity': 0,
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
                ...e[2],
            },
        })),
        {
            selector: 'node[isSource="yes"]',
            style: {
                'border-width': '3px',
                'border-color': '#c20000',
                'background-color': '#efefef',
                'text-outline-color': '#c20000',
                'font-weight': 'bold',
                'shape': 'diamond',
                'color': '#410505',
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
        {
            selector: 'node[isImpure="yes"]',
            style: {
                'background-opacity': 0.5,
                'border-opacity': 0.5,
                'border-color': '#ffc4a7',
                'border-width': '2px',
            },
        },
        {
            'selector': 'edge[isImpure="yes"]',
            'style': {
                'line-style': 'dashed',
                'line-dash-pattern': [3, 8],
                'line-color': '#ffede1',
                'target-arrow-color': '#ffede1',
            },
        },
        {
            'selector': 'edge[isBackupChoice="yes"]',
            'style': {
                'line-style': 'dashed',
                'line-dash-pattern': [3, 8],
                'line-color': '#9de6ff',
                'target-arrow-color': '#9de6ff',
            },
        },
    ];
}