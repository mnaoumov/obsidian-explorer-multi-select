import type {
  FileExplorerView,
  FileTreeItemParent
} from '@obsidian-typings/obsidian-public-latest';
import type {
  FrontMatterCache,
  TFile
} from 'obsidian';

import picomatch from 'picomatch/posix.js';

import type {
  ExplorerTree,
  ExplorerTreeItem
} from '../selection-core/explorer-tree-items.ts';

import {
  getVisibleItems,
  isFolderItem,
  isVisible
} from '../selection-core/explorer-tree-items.ts';

/**
 * Tells whether a row matches a rule.
 *
 * @param item - The row.
 * @param relativePath - The row's path relative to the rule's folder, such as `sub/note.md`.
 * @returns Whether the row matches.
 */
export type ItemRule = (item: ExplorerTreeItem, relativePath: string) => boolean;

/**
 * Builds a rule that matches files by extension.
 *
 * @param input - The extensions, separated by commas or spaces, with or without a leading dot, such as `md, .png`.
 * @returns The rule, or `null` when the input names no extension.
 */
export function createExtensionRule(input: string): ItemRule | null {
  const extensions = new Set(
    input.split(/[\s,]+/u)
      .map((extension) => extension.replace(/^\.+/u, '').toLowerCase())
      .filter((extension) => extension !== '')
  );
  return extensions.size === 0 ? null : (item): boolean => !isFolderItem(item) && extensions.has(getExtension(item.file.name));
}

/**
 * Builds a rule that matches files and folders by a glob pattern, case-insensitively. A pattern without a
 * `/` matches the row's name, the way a `.gitignore` line does; any other pattern matches the path relative
 * to the rule's folder.
 *
 * @param pattern - The glob pattern, such as `*.png` or `drafts/**`.
 * @returns The rule, or `null` when the pattern is empty.
 */
export function createGlobRule(pattern: string): ItemRule | null {
  const trimmedPattern = pattern.trim();
  if (trimmedPattern === '') {
    return null;
  }
  const matchesPattern = picomatch(trimmedPattern, { dot: true, nocase: true });
  const shouldMatchName = !trimmedPattern.includes('/');
  return (item, relativePath) => matchesPattern(shouldMatchName ? item.file.name : relativePath);
}

/**
 * Builds a rule that matches notes by a property value. The value is compared as text, case-insensitively,
 * with the property's value or with any element of a list. An empty value matches every note that has the
 * property.
 *
 * @param getFrontmatter - Reads a file's frontmatter from the metadata cache.
 * @param key - The property name.
 * @param value - The value.
 * @returns The rule.
 */
export function createPropertyRule(getFrontmatter: (file: TFile) => FrontMatterCache | undefined, key: string, value: string): ItemRule {
  const expectedValue = value.trim().toLowerCase();
  return (item) => {
    if (isFolderItem(item)) {
      return false;
    }
    const frontmatter = getFrontmatter(item.file);
    if (!frontmatter || !Object.hasOwn(frontmatter, key)) {
      return false;
    }
    if (expectedValue === '') {
      return true;
    }
    const actualValue: unknown = frontmatter[key];
    const actualValues: unknown[] = Array.isArray(actualValue) ? actualValue : [actualValue];
    return actualValues.some((element) => formatPropertyValue(element) === expectedValue);
  };
}

/**
 * Returns the rows a rule looks at: the folder's children, or everything under it, collapsed folders
 * included. Rows the explorer's filter hides, and hidden rows, are left out.
 *
 * @param folder - The rule's folder.
 * @param shouldIncludeSubfolders - Whether to look inside its subfolders too.
 * @returns The rows, in display order.
 */
export function getCandidateItems(folder: FileTreeItemParent, shouldIncludeSubfolders: boolean): ExplorerTreeItem[] {
  const items: ExplorerTreeItem[] = [];
  for (const child of folder.vChildren.children) {
    if (!isVisible(child)) {
      continue;
    }
    items.push(child);
    if (shouldIncludeSubfolders && isFolderItem(child)) {
      items.push(...getCandidateItems(child, true));
    }
  }
  return items;
}

/**
 * Returns the files the explorer's filter shows: every file row it does not filter out, inside collapsed
 * folders too.
 *
 * @param view - The File explorer.
 * @returns The files, or an empty list when no filter is set.
 */
export function getFilterMatchingItems(view: FileExplorerView): ExplorerTreeItem[] {
  return hasActiveFilter(view) ? Object.values(view.fileItems).filter((item) => !isFolderItem(item) && isVisible(item)) : [];
}

/**
 * Returns the path of a row relative to a folder above it.
 *
 * @param item - The row.
 * @param folder - The folder.
 * @returns The path, such as `sub/note.md`.
 */
export function getRelativePath(item: ExplorerTreeItem, folder: FileTreeItemParent): string {
  const folderPath = isFolderTreeItem(folder) ? folder.file.path : '/';
  return folderPath === '/' ? item.file.path : item.file.path.slice(folderPath.length + 1);
}

/**
 * Returns the folder a rule applies to: the focused row when it is a folder, otherwise the focused row's
 * folder, and the vault root when nothing is focused.
 *
 * @param view - The File explorer.
 * @returns The folder.
 */
export function getRuleFolder(view: FileExplorerView): FileTreeItemParent {
  const tree = view.tree;
  const focusedItem = tree.focusedItem;
  if (!focusedItem || !tree.isItem(focusedItem)) {
    return tree.root;
  }
  if (isFolderItem(focusedItem)) {
    return focusedItem;
  }
  // A row's `parent` is not always set in a live explorer, so the folder comes from the file.
  const parentItem = view.fileItems[focusedItem.file.parent?.path ?? '/'];
  return parentItem && isFolderItem(parentItem) ? parentItem : tree.root;
}

/**
 * Returns the name a prompt shows for a rule's folder.
 *
 * @param folder - The folder.
 * @returns The folder's path, or `the vault root`.
 */
export function getRuleFolderLabel(folder: FileTreeItemParent): string {
  return isFolderTreeItem(folder) && folder.file.path !== '/' ? folder.file.path : 'the vault root';
}

/**
 * Tells whether the explorer's filter is set.
 *
 * @param view - The File explorer.
 * @returns Whether the filter holds a query.
 */
export function hasActiveFilter(view: FileExplorerView): boolean {
  return !!view.searchQuery?.matcher;
}

/**
 * Inverts the selection among the visible rows: each selected row is deselected and each other row is
 * selected.
 *
 * @param tree - The File explorer's tree.
 */
export function invertSelection(tree: ExplorerTree): void {
  for (const item of getVisibleItems(tree.root)) {
    if (tree.selectedDoms.has(item)) {
      tree.deselectItem(item);
    } else {
      tree.selectItem(item);
    }
  }
}

function formatPropertyValue(value: unknown): string {
  switch (typeof value) {
    case 'boolean':
    case 'number':
    case 'string': {
      return String(value).toLowerCase();
    }
    case 'object': {
      return value === null ? '' : JSON.stringify(value).toLowerCase();
    }
    default: {
      return '';
    }
  }
}

function getExtension(name: string): string {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex <= 0 ? '' : name.slice(dotIndex + 1).toLowerCase();
}

function isFolderTreeItem(parent: FileTreeItemParent): parent is Extract<FileTreeItemParent, ExplorerTreeItem> {
  return 'file' in parent;
}
