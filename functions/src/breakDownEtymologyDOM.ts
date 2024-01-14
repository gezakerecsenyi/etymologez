import { StringBreakdown } from '../../src/types';

export default function breakDownEtymologyDOM(dom: Document) {
    const parent = dom.getElementsByClassName('mw-parser-output')[0];
    let relevantNodes = [] as Element[];
    let foundStart = false;
    for (const child of parent.children) {
        if ([
            'P',
            'UL',
        ].includes(child.nodeName)) {
            relevantNodes.push(child);

            if (!foundStart) {
                foundStart = true;
            }
        } else {
            if (foundStart) {
                break;
            }
        }
    }

    let wholeStringSoFar = [] as StringBreakdown[];
    let currentString = '';
    let inLink = false;
    let linkTo = '';
    let linkLevel = -1;

    function traverseText(node: Element | ChildNode, level: number) {
        if (!node.textContent) {
            return;
        }

        function checkIfInLink(preCallback?: () => void) {
            if (node.nodeName === 'A') {
                if (preCallback) {
                    preCallback();
                }

                inLink = true;
                linkTo = (node as HTMLAnchorElement).href!;
                linkLevel = level;

                return true;
            }

            return false;
        }

        if (inLink) {
            if (level > linkLevel) {
                currentString += node.textContent;
            } else {
                wholeStringSoFar.push({
                    type: 'link',
                    text: currentString,
                    linkTo,
                });
                currentString = node.textContent;

                if (!checkIfInLink()) {
                    inLink = false;
                    linkTo = '';
                    linkLevel = -1;
                }
            }
        } else {
            if (!checkIfInLink(() => {
                wholeStringSoFar.push({
                    type: 'string',
                    text: currentString,
                });
                currentString = node.textContent!;
            })) {
                if (node.hasChildNodes() && node.nodeName !== '#text') {
                    for (let child of node.childNodes) {
                        traverseText(child, level + 1);
                    }
                } else {
                    currentString += node.textContent;
                }
            }
        }
    }

    for (const element of relevantNodes) {
        traverseText(element, 0);
    }

    if (inLink) {
        wholeStringSoFar.push({
            type: 'link',
            text: currentString,
            linkTo,
        });
    } else {
        wholeStringSoFar.push({
            type: 'string',
            text: currentString,
        });
    }

    return wholeStringSoFar;
}