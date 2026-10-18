import type {
  FileExplorerView,
  FileTreeItem,
  FileTreeItemParent,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';
import type { View } from 'obsidian';

/**
 * The File explorer's tree. One `Tree` class serves seven views, so everything in this plugin works on this
 * instance only and never on the shared prototype.
 */
export type ExplorerTree = FileExplorerView['tree'];

/**
 * A row of the File explorer: a file or a folder.
 */
export type ExplorerTreeItem = FileTreeItem | FolderTreeItem;

/**
 * How many files and how many folders a selection holds.
 */
export interface SelectionCount {
  readonly fileCount: number;
  readonly folderCount: number;
}

/**
 * Counts the files and the folders among the given rows.
 *
 * @param items - The rows to count.
 * @returns The two counts.
 */
export function countItems(items: Iterable<ExplorerTreeItem>): SelectionCount {
  const itemArray = [...items];
  const folderCount = itemArray.filter((item) => isFolderItem(item)).length;
  return { fileCount: itemArray.length - folderCount, folderCount };
}

/**
 * Formats a selection count the way the status bar shows it, such as `12 files, 3 folders`.
 *
 * @param count - The count to format.
 * @returns The text, or an empty string when nothing is selected.
 */
export function formatSelectionCount(count: SelectionCount): string {
  const parts: string[] = [];
  if (count.fileCount > 0) {
    parts.push(pluralize(count.fileCount, 'file'));
  }
  if (count.folderCount > 0) {
    parts.push(pluralize(count.folderCount, 'folder'));
  }
  return parts.join(', ');
}

/**
 * Returns the rows from `first` to `last`, both included, in the order the explorer shows them.
 *
 * @param visibleItems - The visible rows, in display order, from {@link getVisibleItems}.
 * @param first - One end of the range.
 * @param last - The other end of the range; it may come before `first`.
 * @returns The rows of the range, or `undefined` when either end is not visible.
 */
export function getItemsInRange(visibleItems: readonly ExplorerTreeItem[], first: ExplorerTreeItem, last: ExplorerTreeItem): ExplorerTreeItem[] | undefined {
  const firstIndex = visibleItems.indexOf(first);
  const lastIndex = visibleItems.indexOf(last);
  return firstIndex === -1 || lastIndex === -1
    ? undefined
    : visibleItems.slice(Math.min(firstIndex, lastIndex), Math.max(firstIndex, lastIndex) + 1);
}

/**
 * Returns the visible direct children of a folder, in display order.
 *
 * @param parent - The folder, or the tree's root.
 * @returns The rows a user sees directly inside it.
 */
export function getVisibleChildren(parent: FileTreeItemParent): ExplorerTreeItem[] {
  return parent.vChildren.children.filter((child) => isVisible(child));
}

/**
 * Returns every row a user can see under a folder, in display order: the contents of a collapsed folder
 * and the rows the explorer's filter hides are left out, the way core's own arrow-key navigation skips them.
 *
 * @param parent - The folder, or the tree's root.
 * @returns The visible rows.
 */
export function getVisibleItems(parent: FileTreeItemParent): ExplorerTreeItem[] {
  const items: ExplorerTreeItem[] = [];
  for (const child of getVisibleChildren(parent)) {
    items.push(child);
    if (isFolderItem(child) && !child.collapsed) {
      items.push(...getVisibleItems(child));
    }
  }
  return items;
}

/**
 * Tells a built File explorer view from a deferred one, which has no tree yet.
 *
 * @param view - The view of a `file-explorer` leaf.
 * @returns Whether the view is built.
 */
export function isFileExplorerView(view: View): view is FileExplorerView {
  return 'tree' in view;
}

/**
 * Tells a folder row from a file row the way core does: only a folder row has children.
 *
 * @param item - The row.
 * @returns Whether the row is a folder.
 */
export function isFolderItem(item: ExplorerTreeItem): item is FolderTreeItem {
  return 'vChildren' in item;
}

function isVisible(item: ExplorerTreeItem): boolean {
  return !item.info.hidden && !item.el.hasClass('is-filtered-out');
}

function pluralize(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
