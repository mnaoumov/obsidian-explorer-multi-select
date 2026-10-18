import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  KeymapEventListener,
  Modifier,
  Scope
} from 'obsidian';

import { CallbackLayoutReadyComponent } from '@mnaoumov/obsidian-lib/components/layout-ready-component';
import { MonkeyAroundComponent } from '@mnaoumov/obsidian-lib/components/monkey-around-component';
import { ViewType } from '@obsidian-typings/obsidian-public-latest/implementations';

import type { ExplorerTree } from './explorer-tree-items.ts';

import { ExplorerSelectionModeComponent } from './explorer-selection-mode-component.ts';
import {
  countItems,
  formatSelectionCount,
  isFileExplorerView
} from './explorer-tree-items.ts';
import { ExplorerTreeKeyboard } from './explorer-tree-keyboard.ts';

interface ExplorerSelectionComponentConstructorParams {
  readonly app: App;
  readonly shouldEnterSelectionModeOnLongPress: () => boolean;
  readonly statusBarItemEl: HTMLElement;
}

/**
 * Owns the File explorer's selection: it adds the keyboard selection and the touch selection mode to every
 * explorer, and shows the selection's size in the status bar.
 *
 * It patches each explorer's tree INSTANCE. The `Tree` prototype also serves Bookmarks, Tags, Outline and
 * four other views, which must keep core's behavior.
 */
export class ExplorerSelectionComponent extends MonkeyAroundComponent {
  private readonly app: App;
  private readonly attachedTrees = new WeakSet<ExplorerTree>();
  private lastChangedTree: ExplorerTree | undefined;
  private readonly selectionModes = new Map<ExplorerTree, ExplorerSelectionModeComponent>();
  private readonly shouldEnterSelectionModeOnLongPress: () => boolean;
  private readonly statusBarItemEl: HTMLElement;

  public constructor(params: ExplorerSelectionComponentConstructorParams) {
    super();
    this.app = params.app;
    this.shouldEnterSelectionModeOnLongPress = params.shouldEnterSelectionModeOnLongPress;
    this.statusBarItemEl = params.statusBarItemEl;
  }

  /**
   * Tells whether there is a File explorer whose selection mode can be toggled.
   *
   * @returns Whether a File explorer leaf exists.
   */
  public hasExplorer(): boolean {
    return this.app.workspace.getLeavesOfType(ViewType.FileExplorer).length > 0;
  }

  public override onload(): void {
    this.statusBarItemEl.addClass('explorer-multi-select-status-bar-item');
    this.statusBarItemEl.hide();
    this.addChild(new CallbackLayoutReadyComponent(this.app, this.onLayoutReady.bind(this)));
  }

  /**
   * Shows the first File explorer and toggles its selection mode.
   */
  public async toggleSelectionMode(): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType(ViewType.FileExplorer)[0];
    if (!leaf) {
      return;
    }
    await leaf.loadIfDeferred();
    await this.app.workspace.revealLeaf(leaf);
    this.attachToExplorers();
    if (isFileExplorerView(leaf.view)) {
      this.selectionModes.get(leaf.view.tree)?.toggle();
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
      this.attachToTree(view.tree);
      this.selectionModes.set(
        view.tree,
        this.addChild(new ExplorerSelectionModeComponent({ app: this.app, shouldEnterOnLongPress: this.shouldEnterSelectionModeOnLongPress, view }))
      );
    }

    for (const [tree, selectionMode] of this.selectionModes) {
      if (trees.has(tree)) {
        continue;
      }

      // Its explorer was closed.
      this.removeChild(selectionMode);
      this.selectionModes.delete(tree);
    }

    if (!this.lastChangedTree || trees.has(this.lastChangedTree)) {
      return;
    }
    this.lastChangedTree = undefined;
    this.updateStatusBar();
  }

  private attachToTree(tree: ExplorerTree): void {
    // Every core change to the selection goes through these three methods, except the explorer's own
    // `onDelete`, which the vault `delete` event covers.
    for (const methodName of ['clearSelectedDoms', 'deselectItem', 'selectItem'] as const) {
      this.registerMethodPatch({
        $object: tree,
        methodName,
        patchHandler: ({ fallback }) => {
          fallback();
          this.onSelectionChanged(tree);
        }
      });
    }

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

  private onLayoutReady(): void {
    this.attachToExplorers();
    this.registerEvent(this.app.workspace.on('layout-change', this.attachToExplorers.bind(this)));
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

  private updateStatusBar(): void {
    const text = this.lastChangedTree ? formatSelectionCount(countItems(this.lastChangedTree.selectedDoms)) : '';
    this.statusBarItemEl.setText(text);
    this.statusBarItemEl.toggle(text !== '');
  }
}
