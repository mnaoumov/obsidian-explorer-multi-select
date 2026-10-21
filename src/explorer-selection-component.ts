import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  KeymapEventListener,
  Menu,
  Modifier,
  Scope,
  TAbstractFile
} from 'obsidian';

import { CallbackLayoutReadyComponent } from '@mnaoumov/obsidian-lib/components/layout-ready-component';
import { MonkeyAroundComponent } from '@mnaoumov/obsidian-lib/components/monkey-around-component';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { ViewType } from '@obsidian-typings/obsidian-public-latest/implementations';
import { Platform } from 'obsidian';

import type {
  ExplorerTree,
  ExplorerTreeItem
} from './explorer-tree-items.ts';
import type { PluginSettings } from './plugin-settings.ts';

import { ExplorerBatchDelete } from './explorer-batch-delete.ts';
import { ExplorerSelectionModeComponent } from './explorer-selection-mode-component.ts';
import { ExplorerTreeClickComponent } from './explorer-tree-click-component.ts';
import {
  countItems,
  formatSelectionCount,
  isFileExplorerView
} from './explorer-tree-items.ts';
import { ExplorerTreeKeyboard } from './explorer-tree-keyboard.ts';
import {
  FILE_EXPLORER_MENU_SOURCE,
  findMenuItemByIcon
} from './menu-items.ts';
import { invertSelection } from './select-by-rule.ts';

/**
 * The icon of core's Delete item, which is how it is told apart from the items that `files-menu` listeners
 * add: its title is translated.
 */
const DELETE_MENU_ITEM_ICON_CLASS = 'lucide-trash-2';

interface ExplorerSelectionComponentConstructorParams {
  readonly app: App;
  readonly getSettings: () => PluginSettings;
  readonly statusBarItemEl: HTMLElement;
}

/**
 * Owns the File explorer's selection: it adds the keyboard selection, the touch selection mode and the batch
 * delete to every explorer, and shows the selection's size in the status bar.
 *
 * It patches each explorer's tree INSTANCE. The `Tree` prototype also serves Bookmarks, Tags, Outline and
 * four other views, which must keep core's behavior.
 */
export class ExplorerSelectionComponent extends MonkeyAroundComponent {
  private readonly app: App;
  private readonly attachedTrees = new WeakSet<ExplorerTree>();
  private readonly batchDeletes = new Map<ExplorerTree, ExplorerBatchDelete>();
  private readonly clicks = new Map<ExplorerTree, ExplorerTreeClickComponent>();
  private readonly getSettings: () => PluginSettings;
  private lastChangedTree: ExplorerTree | undefined;
  private readonly selectionModes = new Map<ExplorerTree, ExplorerSelectionModeComponent>();
  private readonly statusBarItemEl: HTMLElement;

  public constructor(params: ExplorerSelectionComponentConstructorParams) {
    super();
    this.app = params.app;
    this.getSettings = params.getSettings;
    this.statusBarItemEl = params.statusBarItemEl;
  }

  /**
   * Returns the first File explorer when it is built, without showing it.
   *
   * @returns The explorer, or `null` when there is none or it is still deferred.
   */
  public getExplorerView(): FileExplorerView | null {
    return this.getExplorerViews()[0] ?? null;
  }

  /**
   * Tells whether there is a File explorer whose selection mode can be toggled.
   *
   * @returns Whether a File explorer leaf exists.
   */
  public hasExplorer(): boolean {
    return this.app.workspace.getLeavesOfType(ViewType.FileExplorer).length > 0;
  }

  /**
   * Inverts the selection among an explorer's visible rows.
   *
   * @param view - The explorer.
   */
  public invertSelection(view: FileExplorerView): void {
    invertSelection(view.tree);
    this.showSelection(view);
  }

  public override onload(): void {
    this.statusBarItemEl.addClass('explorer-multi-select-status-bar-item');
    this.statusBarItemEl.hide();
    this.addChild(new CallbackLayoutReadyComponent(this.app, this.onLayoutReady.bind(this)));
  }

  /**
   * Shows the first File explorer, building it when it is deferred.
   *
   * @returns The explorer, or `null` when there is none.
   */
  public async revealExplorer(): Promise<FileExplorerView | null> {
    const leaf = this.app.workspace.getLeavesOfType(ViewType.FileExplorer)[0];
    if (!leaf) {
      return null;
    }
    await leaf.loadIfDeferred();
    await this.app.workspace.revealLeaf(leaf);
    this.attachToExplorers();
    return isFileExplorerView(leaf.view) ? leaf.view : null;
  }

  /**
   * Adds rows to an explorer's selection.
   *
   * @param view - The explorer.
   * @param items - The rows.
   * @returns The rows that were not selected before and are now.
   */
  public selectItems(view: FileExplorerView, items: readonly ExplorerTreeItem[]): ExplorerTreeItem[] {
    const tree = view.tree;
    const newItems = items.filter((item) => !tree.selectedDoms.has(item));
    for (const item of newItems) {
      tree.selectItem(item);
    }
    this.showSelection(view);
    // `selectItem` skips a row that is not selectable.
    return newItems.filter((item) => tree.selectedDoms.has(item));
  }

  /**
   * Shows the first File explorer and toggles its selection mode.
   */
  public async toggleSelectionMode(): Promise<void> {
    const view = await this.revealExplorer();
    if (view) {
      this.selectionModes.get(view.tree)?.toggle();
    }
  }

  private attachToExplorers(): void {
    const views = this.getExplorerViews();
    const trees = new Set(views.map((view) => view.tree));
    for (const view of views) {
      if (this.attachedTrees.has(view.tree)) {
        continue;
      }
      this.attachedTrees.add(view.tree);
      const batchDelete = new ExplorerBatchDelete({ app: this.app, view });
      this.batchDeletes.set(view.tree, batchDelete);
      const click = this.addChild(new ExplorerTreeClickComponent({ app: this.app, getSettings: this.getSettings, view }));
      this.clicks.set(view.tree, click);
      this.attachToTree(view.tree, batchDelete, click);
      this.selectionModes.set(
        view.tree,
        this.addChild(
          new ExplorerSelectionModeComponent({
            app: this.app,
            batchDelete,
            shouldEnterOnLongPress: (): boolean => this.getSettings().shouldEnterSelectionModeOnLongPress,
            view
          })
        )
      );
    }

    for (const [tree, selectionMode] of this.selectionModes) {
      if (trees.has(tree)) {
        continue;
      }

      // Its explorer was closed.
      this.removeChild(selectionMode);
      this.selectionModes.delete(tree);
      // Both are added together, per explorer.
      this.removeChild(ensureNonNullable(this.clicks.get(tree)));
      this.clicks.delete(tree);
      this.batchDeletes.delete(tree);
    }

    if (!this.lastChangedTree || trees.has(this.lastChangedTree)) {
      return;
    }
    this.lastChangedTree = undefined;
    this.updateStatusBar();
  }

  private attachToTree(tree: ExplorerTree, batchDelete: ExplorerBatchDelete, click: ExplorerTreeClickComponent): void {
    this.registerMethodPatch({
      $object: tree,
      methodName: 'handleItemSelection',
      patchHandler: ({ fallback, originalArguments: [mouseEvent, item] }) =>
        // TODO(T3643): Drop `castTo` once `obsidian-typings` releases `handleItemSelection` returning `boolean`.
        click.handleItemSelection(mouseEvent, item, castTo<() => boolean>(fallback))
    });

    // Every core change to the selection goes through these three methods, except the explorer's own
    // `onDelete`, which the vault `delete` event covers.
    for (const methodName of ['clearSelectedDoms', 'deselectItem', 'selectItem'] as const) {
      this.registerMethodPatch({
        $object: tree,
        methodName,
        patchHandler: ({ fallback }) => {
          if (methodName === 'clearSelectedDoms' && click.isKeepingSelection) {
            return;
          }
          fallback();
          this.onSelectionChanged(tree);
        }
      });
    }

    // Core's Delete key reads this from the tree on every press, so the instance patch reaches it.
    this.registerMethodPatch({
      $object: tree,
      methodName: 'handleDeleteSelectedItems',
      patchHandler: ({ fallback, originalArguments: [keyboardEvent] }) => {
        if (!batchDelete.isBatch()) {
          return fallback();
        }
        keyboardEvent.preventDefault();
        return batchDelete.deleteSelection();
      }
    });

    const keyboard = new ExplorerTreeKeyboard(tree);
    this.registerLeadingKey(tree.scope, ['Mod'], 'A', (keyboardEvent) => keyboard.selectAll(keyboardEvent));
    this.registerLeadingKey(tree.scope, [], ' ', (keyboardEvent) => keyboard.toggleFocusedItem(keyboardEvent));
    this.registerLeadingKey(tree.scope, ['Shift'], 'ArrowDown', (keyboardEvent) => keyboard.extendRange(keyboardEvent, 'forwards'));
    this.registerLeadingKey(tree.scope, ['Shift'], 'ArrowUp', (keyboardEvent) => keyboard.extendRange(keyboardEvent, 'backwards'));
  }

  private getExplorerViews(): FileExplorerView[] {
    const views: FileExplorerView[] = [];
    for (const leaf of this.app.workspace.getLeavesOfType(ViewType.FileExplorer)) {
      // A deferred leaf has no tree until it is first shown; `layout-change` brings it back here.
      if (isFileExplorerView(leaf.view)) {
        views.push(leaf.view);
      }
    }
    return views;
  }

  /**
   * Re-points core's Delete item in the explorer's menu for a multi-item selection, which asks once per item,
   * to the batch delete. Core adds that item before it fires `files-menu`, so it is in the menu already.
   *
   * @param menu - The menu.
   * @param files - The files the menu is for.
   * @param source - Where the menu was opened.
   */
  private onFilesMenu(menu: Menu, files: TAbstractFile[], source: string): void {
    if (source !== FILE_EXPLORER_MENU_SOURCE) {
      return;
    }
    const coreDeleteItem = findMenuItemByIcon(menu, DELETE_MENU_ITEM_ICON_CLASS);
    if (!coreDeleteItem) {
      return;
    }
    // Core opens this menu for the whole selection of the explorer it was opened in.
    const fileSet = new Set(files);
    for (const [tree, batchDelete] of this.batchDeletes) {
      if (batchDelete.isBatch() && tree.selectedDoms.size === fileSet.size && [...tree.selectedDoms].every((item) => fileSet.has(item.file))) {
        coreDeleteItem.onClick(() => {
          invokeAsyncSafely(() => batchDelete.deleteSelection());
        });
        return;
      }
    }
  }

  private onLayoutReady(): void {
    this.attachToExplorers();
    this.registerEvent(this.app.workspace.on('layout-change', this.attachToExplorers.bind(this)));
    this.registerEvent(this.app.workspace.on('files-menu', this.onFilesMenu.bind(this)));
    this.registerEvent(this.app.vault.on('delete', () => {
      // The explorer drops a deleted row from the selection in its own `delete` handler, which may run
      // after this one. A microtask runs once every handler of this event has.
      queueMicrotask(() => {
        this.updateStatusBar();
        for (const selectionMode of this.selectionModes.values()) {
          selectionMode.refresh();
        }
      });
    }));
  }

  private onSelectionChanged(tree: ExplorerTree): void {
    this.lastChangedTree = tree;
    this.updateStatusBar();
    this.selectionModes.get(tree)?.refresh();
  }

  /**
   * Registers a key on a scope AHEAD of the keys already there. `Scope` runs only the first entry that
   * matches a key, and core registered Space and Shift+Up/Down when it built the tree, so a key appended
   * after them would never run.
   *
   * @param scope - The tree's scope.
   * @param modifiers - The key's modifiers.
   * @param key - The key.
   * @param listener - The listener.
   */
  private registerLeadingKey(scope: Scope, modifiers: Modifier[], key: string, listener: KeymapEventListener): void {
    const handler = scope.register(modifiers, key, listener);
    // `register` appends; move that last entry to the front.
    scope.keys.unshift(...scope.keys.splice(-1));
    this.register(() => {
      scope.unregister(handler);
    });
  }

  /**
   * On mobile, turns the selection mode on after a command changed the selection, because a phone shows a
   * selection only through the mode's checkboxes and bar.
   *
   * @param view - The explorer.
   */
  private showSelection(view: FileExplorerView): void {
    if (Platform.isMobile && view.tree.selectedDoms.size > 0) {
      this.selectionModes.get(view.tree)?.enter();
    }
  }

  private updateStatusBar(): void {
    const text = this.lastChangedTree ? formatSelectionCount(countItems(this.lastChangedTree.selectedDoms)) : '';
    this.statusBarItemEl.setText(text);
    this.statusBarItemEl.toggle(text !== '');
  }
}
