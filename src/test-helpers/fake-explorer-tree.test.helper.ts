import type {
  FileExplorerView,
  FileTreeItem,
  FileTreeItemParent,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';
import type {
  KeymapEventHandler,
  KeymapEventListener,
  Modifier,
  Scope
} from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { vi } from 'vitest';

import type {
  ExplorerTree,
  ExplorerTreeItem
} from '../explorer-tree-items.ts';

interface FakeExplorerTreeAddFileOptions {
  readonly isFilteredOut?: boolean;
  readonly isHidden?: boolean;
  readonly isSelectable?: boolean;
}

interface FakeExplorerTreeAddFolderOptions extends FakeExplorerTreeAddFileOptions {
  readonly isCollapsed?: boolean;
}

interface FakeExplorerViewConstructorOptions {
  readonly hasNavButtons?: boolean;
}

interface FakeFile {
  readonly name: string;
  readonly path: string;
}

interface FakeKeyEntry {
  readonly key: null | string;
  readonly listener: KeymapEventListener;
  readonly modifiers: null | string;
  readonly scope: Scope;
}

interface FakeTreeView {
  readonly leaf: object;
}

interface SelectableItem {
  readonly selectable: boolean;
}

/**
 * A scope that dispatches the way Obsidian's does: the FIRST entry matching the key runs, and nothing after it.
 * The `obsidian-test-mocks` scope records handlers but never runs them, and has no `keys`.
 */
export class FakeScope {
  public readonly keys: FakeKeyEntry[] = [];

  public asScope(): Scope {
    return castTo<Scope>(this);
  }

  public dispatch(modifiers: Modifier[], key: string, keyboardEvent: KeyboardEvent): unknown {
    const compiledModifiers = modifiers.join(',');
    const entry = this.keys.find((keyEntry) => keyEntry.key === key && keyEntry.modifiers === compiledModifiers);
    return entry?.listener(keyboardEvent, { key, modifiers: compiledModifiers, vkey: key });
  }

  public register(modifiers: Modifier[], key: string, listener: KeymapEventListener): KeymapEventHandler {
    const entry: FakeKeyEntry = { key, listener, modifiers: modifiers.join(','), scope: this.asScope() };
    this.keys.push(entry);
    return entry;
  }

  public unregister(handler: KeymapEventHandler): void {
    this.keys.remove(castTo<FakeKeyEntry>(handler));
  }
}

/**
 * A stand-in for the File explorer's `Tree`: the members the plugin uses, with core's behavior.
 */
export class FakeExplorerTree {
  public activeDom: ExplorerTreeItem | null = null;
  public readonly containerEl = createDiv({ cls: 'nav-files-container' });
  public readonly fileItems: Record<string, ExplorerTreeItem> = {};
  public readonly files = new WeakMap<HTMLElement, FakeFile>();
  public focusedItem: ExplorerTreeItem | null = null;
  public readonly onKeyArrowDown = vi.fn();
  public readonly onKeyArrowUp = vi.fn();
  public readonly onKeyOpen = vi.fn();
  public readonly root: FileTreeItemParent;
  public readonly scope = new FakeScope();
  public readonly selectedDoms = new Set<ExplorerTreeItem>();
  public view: FakeTreeView = { leaf: {} };

  public constructor() {
    this.root = castTo<FileTreeItemParent>({ vChildren: { children: [] } });
  }

  public addFile(name: string, parent: FileTreeItemParent = this.root, options: FakeExplorerTreeAddFileOptions = {}): FileTreeItem {
    const item = castTo<FileTreeItem>(createItemBase(name, parent, options));
    parent.vChildren.children.push(item);
    this.register(item);
    return item;
  }

  public addFolder(name: string, parent: FileTreeItemParent = this.root, options: FakeExplorerTreeAddFolderOptions = {}): FolderTreeItem {
    const item = castTo<FolderTreeItem>({
      ...createItemBase(name, parent, options),
      collapsed: options.isCollapsed ?? false,
      vChildren: { children: [] }
    });
    item.selfEl.createDiv({ cls: 'tree-item-icon collapse-icon' });
    parent.vChildren.children.push(item);
    this.register(item);
    return item;
  }

  public asTree(): ExplorerTree {
    return castTo<ExplorerTree>(this);
  }

  /**
   * Moves the focus the way core does: to the next or previous visible row, starting from the first row when
   * nothing is focused.
   *
   * @param direction - Which way to move.
   */
  public changeFocusedItem(direction: 'backwards' | 'forwards'): void {
    const visibleItems = flattenVisible(this.root);
    if (!this.focusedItem) {
      this.focusedItem = visibleItems[0] ?? null;
      return;
    }
    const index = visibleItems.indexOf(this.focusedItem);
    const nextItem = visibleItems[direction === 'forwards' ? index + 1 : index - 1];
    if (nextItem) {
      this.focusedItem = nextItem;
    }
  }

  public clearSelectedDoms(): void {
    this.selectedDoms.clear();
  }

  public deselectItem(item: ExplorerTreeItem): void {
    this.selectedDoms.delete(item);
  }

  /**
   * Core's `handleItemSelection`, cut down: Alt-click toggles and Shift-click selects, and both return
   * `true`; any other click clears the selection and the focus and returns `false`, so the row opens.
   *
   * @param mouseEvent - The click.
   * @param item - The clicked row.
   * @returns Whether the click only changed the selection.
   */
  public handleItemSelection(mouseEvent: MouseEvent, item: ExplorerTreeItem): boolean {
    if (mouseEvent.altKey || mouseEvent.shiftKey) {
      this.selectItem(item);
      return true;
    }
    this.clearSelectedDoms();
    this.focusedItem = null;
    this.activeDom = item;
    return false;
  }

  public isItem(node: ExplorerTreeItem | undefined): boolean {
    return !!node && castTo<unknown>(node) !== this.root;
  }

  public selectItem(item: ExplorerTreeItem): void {
    if (castTo<SelectableItem>(item).selectable) {
      this.selectedDoms.add(item);
    }
  }

  public setFocusedItem(item: ExplorerTreeItem | null): void {
    this.focusedItem = item;
  }

  private register(item: ExplorerTreeItem): void {
    this.containerEl.append(item.el);
    this.files.set(item.el, castTo<FakeFile>(item.file));
    this.fileItems[item.file.path] = item;
  }
}

/**
 * A stand-in for the File explorer view: its container with the header buttons and the tree, and the
 * core actions the selection mode calls, as spies.
 */
export class FakeExplorerView {
  public readonly containerEl = createDiv();
  public readonly leaf = {};
  public readonly navButtonsEl: HTMLElement | null;
  public readonly onDeleteSelectedFiles = vi.fn();
  public readonly openFileContextMenu = vi.fn();

  public get fileItems(): Record<string, ExplorerTreeItem> {
    return this.tree.fileItems;
  }

  public get files(): WeakMap<HTMLElement, FakeFile> {
    return this.tree.files;
  }

  public constructor(public readonly tree = new FakeExplorerTree(), options: FakeExplorerViewConstructorOptions = {}) {
    const headerEl = this.containerEl.createDiv({ cls: 'nav-header' });
    this.navButtonsEl = options.hasNavButtons ?? true ? headerEl.createDiv({ cls: 'nav-buttons-container' }) : null;
    this.containerEl.append(tree.containerEl);
    tree.view = this;
  }

  public asView(): FileExplorerView {
    return castTo<FileExplorerView>(this);
  }
}

/**
 * Creates a key event whose `targetNode` is the given element, as Obsidian's keymap sees it.
 *
 * @param target - The element the key was pressed in.
 * @returns The event.
 */
export function createKeyboardEvent(target: Node | null = null): KeyboardEvent {
  const keyboardEvent = new KeyboardEvent('keydown');
  Object.defineProperty(keyboardEvent, 'targetNode', { value: target });
  return keyboardEvent;
}

function createItemBase(name: string, parent: FileTreeItemParent, options: FakeExplorerTreeAddFileOptions): object {
  const el = createDiv();
  const selfEl = el.createDiv({ cls: 'tree-item-self' });
  selfEl.createDiv({ cls: 'tree-item-inner', text: name });
  if (options.isFilteredOut) {
    el.addClass('is-filtered-out');
  }
  return {
    el,
    file: { name, path: name },
    info: { hidden: options.isHidden ?? false },
    parent,
    selectable: options.isSelectable ?? true,
    selfEl
  };
}

function flattenVisible(parent: FileTreeItemParent): ExplorerTreeItem[] {
  const items: ExplorerTreeItem[] = [];
  for (const child of parent.vChildren.children) {
    if (child.info.hidden) {
      continue;
    }
    items.push(child);
    if ('vChildren' in child && !child.collapsed) {
      items.push(...flattenVisible(child));
    }
  }
  return items;
}
