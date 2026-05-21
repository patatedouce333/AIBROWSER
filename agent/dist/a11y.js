"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPageContext = extractPageContext;
const SKIP_ROLES = new Set([
    'none', 'presentation', 'generic', 'InlineTextBox', 'LineBreak', 'ScrollArea',
]);
const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'textbox', 'combobox', 'listbox', 'checkbox', 'radio',
    'switch', 'slider', 'spinbutton', 'searchbox', 'menuitem', 'tab', 'option',
    'treeitem', 'columnheader', 'rowheader', 'cell',
]);
const A11Y_TIMEOUT_MS = 10000;
async function extractPageContext(client) {
    const nodeMap = new Map();
    // URL + title
    const { result } = await client.Runtime.evaluate({
        expression: `({ url: location.href, title: document.title })`,
        returnByValue: true,
    });
    const { url, title } = result.value;
    // Accessibility tree with timeout
    const axResult = await Promise.race([
        client.Accessibility.getFullAXTree(),
        sleep(A11Y_TIMEOUT_MS).then(() => { throw new Error(`getFullAXTree timeout after ${A11Y_TIMEOUT_MS}ms`); }),
    ]);
    const nodes = axResult?.nodes ?? [];
    if (nodes.length === 0) {
        return { url, title, tree: '(empty page)', nodeMap };
    }
    const tree = buildCompactTree(nodes, nodeMap);
    return { url, title, tree, nodeMap };
}
function buildCompactTree(nodes, nodeMap) {
    let counter = 0;
    // Build lookup maps
    const nodeById = new Map();
    const childrenMap = new Map();
    for (const n of nodes) {
        if (!n.nodeId)
            continue;
        nodeById.set(n.nodeId, n);
        if (n.childIds?.length)
            childrenMap.set(n.nodeId, n.childIds);
    }
    // Find roots
    const childSet = new Set();
    for (const ids of childrenMap.values())
        ids.forEach(id => childSet.add(id));
    let roots = nodes.filter(n => n.nodeId && !childSet.has(n.nodeId));
    if (roots.length === 0 && nodes.length > 0)
        roots = [nodes[0]];
    // Seen labels for deduplication (per role)
    const seenLabels = new Map(); // "role:name" → count
    const interactiveLines = [];
    const staticLines = [];
    function visit(nodeId, depth) {
        if (depth > 15)
            return;
        const node = nodeById.get(nodeId);
        if (!node)
            return;
        const role = node.role?.value ?? '';
        const name = node.name?.value ?? '';
        const value = node.value?.value ?? '';
        const desc = node.description?.value ?? '';
        const isInteractive = INTERACTIVE_ROLES.has(role);
        if (!SKIP_ROLES.has(role) && (name || isInteractive || value)) {
            // Dedup
            const key = `${role}:${name}`;
            const count = seenLabels.get(key) ?? 0;
            seenLabels.set(key, count + 1);
            if (count < 3) { // allow up to 3 identical labels
                const id = ++counter;
                nodeMap.set(id, node);
                const indent = '  '.repeat(Math.min(depth, 6));
                const parts = [`[${id}]`, role];
                if (name)
                    parts.push(`"${name.slice(0, 60)}"`);
                if (value)
                    parts.push(`val="${value.slice(0, 40)}"`);
                if (desc && desc !== name)
                    parts.push(`(${desc.slice(0, 40)})`);
                const line = indent + parts.join(' ');
                if (isInteractive)
                    interactiveLines.push(line);
                else
                    staticLines.push(line);
            }
        }
        const children = childrenMap.get(nodeId) ?? [];
        children.forEach(cid => visit(cid, depth + 1));
    }
    roots.forEach(r => visit(r.nodeId, 0));
    // Prioritize interactive elements — take all of them, then fill with static
    const MAX_LINES = 400;
    const combined = [
        ...interactiveLines,
        ...staticLines.slice(0, Math.max(0, MAX_LINES - interactiveLines.length)),
    ];
    return combined.join('\n');
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
