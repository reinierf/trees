/** Globally unique key of a tree: source ids are only unique within their source. */
export function treeKey(tree: { source: string; id: string }): string {
  return `${tree.source}:${tree.id}`
}
