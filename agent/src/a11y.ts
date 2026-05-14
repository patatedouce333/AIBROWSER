/**
 * Accessibility tree extractor — texte compact pour le LLM
 * BEAUCOUP plus rapide et moins de tokens que screenshot + vision
 */

export interface A11yNode {
  id: number;
  role: string;
  name: string;
  value?: string;
  description?: string;
  children?: A11yNode[];
  backendNodeId?: number;
  nodeId?: string;
}

export interface PageContext {
  url: string;
  title: string;
  tree: string;       // compact text for LLM
  nodeMap: Map<number, any>; // id → raw CDP node (for execution)
}

// Roles that are irrelevant for automation
const SKIP_ROLES = new Set([
  'none', 'presentation', 'generic', 'InlineTextBox',
  'StaticText', 'LineBreak', 'ScrollArea',
]);

// Roles that are interactive
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'combobox', 'listbox',
  'checkbox', 'radio', 'switch', 'slider', 'spinbutton',
  'searchbox', 'menuitem', 'tab', 'option', 'treeitem',
  'columnheader', 'rowheader', 'cell',
]);

let nodeCounter = 0;

export async function extractPageContext(client: any): Promise<PageContext> {
  nodeCounter = 0;
  const nodeMap = new Map<number, any>();

  // Get URL and title
  const { result: titleResult } = await client.Runtime.evaluate({
    expression: `({ url: location.href, title: document.title })`,
    returnByValue: true,
  });
  const { url, title } = titleResult.value;

  // Get full accessibility tree via CDP
  const { nodes } = await client.Accessibility.getFullAXTree();

  // Build compact text representation
  const tree = buildCompactTree(nodes, nodeMap);

  return { url, title, tree, nodeMap };
}

function buildCompactTree(nodes: any[], nodeMap: Map<number, any>): string {
  // Build parent → children map
  const childrenMap = new Map<string, string[]>();
  const nodeById = new Map<string, any>();

  for (const node of nodes) {
    nodeById.set(node.nodeId, node);
    if (node.childIds) {
      childrenMap.set(node.nodeId, node.childIds);
    }
  }

  // Find root (no parent references it as child)
  const childSet = new Set<string>();
  for (const ids of childrenMap.values()) {
    ids.forEach(id => childSet.add(id));
  }
  const roots = nodes.filter(n => !childSet.has(n.nodeId));

  const lines: string[] = [];

  function visit(nodeId: string, depth: number) {
    if (depth > 12) return;
    const node = nodeById.get(nodeId);
    if (!node) return;

    const role = node.role?.value || '';
    const name = node.name?.value || '';
    const value = node.value?.value || '';
    const description = node.description?.value || '';

    // Skip irrelevant nodes
    if (SKIP_ROLES.has(role)) {
      // Still recurse for children
      const children = childrenMap.get(nodeId) || [];
      children.forEach(cid => visit(cid, depth));
      return;
    }

    // Skip nodes with no name and no interactive role
    if (!name && !INTERACTIVE_ROLES.has(role) && !value) {
      const children = childrenMap.get(nodeId) || [];
      children.forEach(cid => visit(cid, depth));
      return;
    }

    // Assign compact ID
    const id = ++nodeCounter;
    nodeMap.set(id, node);

    // Build line
    const indent = '  '.repeat(depth);
    const parts: string[] = [`[${id}]`, role];
    if (name) parts.push(`"${name.slice(0, 60)}"`);
    if (value) parts.push(`val="${value.slice(0, 40)}"`);
    if (description && description !== name) parts.push(`(${description.slice(0, 40)})`);

    lines.push(indent + parts.join(' '));

    // Recurse
    const children = childrenMap.get(nodeId) || [];
    children.forEach(cid => visit(cid, depth + 1));
  }

  roots.forEach(r => visit(r.nodeId, 0));

  return lines.slice(0, 300).join('\n'); // cap at 300 lines to save tokens
}
