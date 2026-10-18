import type {
  Menu,
  MenuItem,
  TAbstractFile,
  WorkspaceLeaf
} from 'obsidian';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  App,
  Platform
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ExplorerBatchDelete } from './explorer-batch-delete.ts';

import {
  ExplorerSelectionModeComponent,
  getEventTargetElement
} from './explorer-selection-mode-component.ts';
import { FakeExplorerView } from './test-helpers/fake-explorer-tree.test.helper.ts';

interface BookmarksLike {
  onFilesMenu: (menu: Menu, files: TAbstractFile[], source: string, leaf?: WorkspaceLeaf) => void;
}

interface InternalPluginsHolder {
  internalPlugins: InternalPluginsLike;
}

interface InternalPluginsLike {
  getEnabledPluginById: (id: string) => BookmarksLike | null;
}

describe('ExplorerSelectionModeComponent', () => {
  let app: App;
  let bookmarks: BookmarksLike | null;
  let deleteSelectionSpy: () => Promise<void>;
  let isMobile: boolean;
  let shouldEnterOnLongPress: boolean;
  let view: FakeExplorerView;

  beforeEach(() => {
    app = App.createConfigured__();
    bookmarks = null;
    deleteSelectionSpy = vi.fn(noopAsync);
    castTo<InternalPluginsHolder>(app.asOriginalType__()).internalPlugins = {
      getEnabledPluginById: (id): BookmarksLike | null => id === 'bookmarks' ? bookmarks : null
    };
    isMobile = Platform.isMobile;
    shouldEnterOnLongPress = true;
    view = new FakeExplorerView();
  });

  afterEach(() => {
    Platform.isMobile = isMobile;
  });

  function actionButton(action: string): HTMLElement {
    const el = view.containerEl.querySelector(`[data-action="${CSS.escape(action)}"]`);
    if (!(el instanceof HTMLElement)) {
      throw new TypeError(`No ${action} button.`);
    }
    return el;
  }

  function addMenuItem(menu: Menu, iconClass: string, callback?: () => void): void {
    const iconEl = createDiv();
    iconEl.createSvg('svg', { cls: iconClass });
    menu.items.push(castTo<MenuItem>({ callback, iconEl }));
  }

  function click(el: Node, init: MouseEventInit = {}): MouseEvent {
    const event_ = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(event_);
    return event_;
  }

  function contextMenu(el: Node): MouseEvent {
    const event_ = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(event_);
    return event_;
  }

  function countText(): null | string {
    return view.containerEl.querySelector('.explorer-multi-select-action-bar-count')?.textContent ?? null;
  }

  function loadMode(): ExplorerSelectionModeComponent {
    const mode = new ExplorerSelectionModeComponent({
      app: app.asOriginalType__(),
      batchDelete: castTo<ExplorerBatchDelete>({
        deleteSelection: deleteSelectionSpy,
        isBatch: (): boolean => view.tree.selectedDoms.size > 1
      }),
      shouldEnterOnLongPress: (): boolean => shouldEnterOnLongPress,
      view: view.asView()
    });
    mode.load();
    return mode;
  }

  function toggleButton(): HTMLElement {
    const el = view.containerEl.querySelector('.explorer-multi-select-toggle-button');
    if (!(el instanceof HTMLElement)) {
      throw new TypeError('No toggle button.');
    }
    return el;
  }

  it('adds a toggle button to the explorer header that turns the mode on and off', () => {
    const mode = loadMode();
    const file = view.tree.addFile('a.md');

    click(toggleButton());
    expect(mode.isActive).toBe(true);
    expect(view.containerEl.hasClass('explorer-multi-select-selection-mode')).toBe(true);
    expect(toggleButton().hasClass('is-active')).toBe(true);
    expect(countText()).toBe('Nothing selected');

    view.tree.selectItem(file);
    click(toggleButton());
    expect(mode.isActive).toBe(false);
    expect(view.containerEl.hasClass('explorer-multi-select-selection-mode')).toBe(false);
    expect(toggleButton().hasClass('is-active')).toBe(false);
    expect(countText()).toBeNull();
    expect(view.tree.selectedDoms.size).toBe(0);
  });

  it('works without a header to put its button in', () => {
    view = new FakeExplorerView(undefined, { hasNavButtons: false });
    const mode = loadMode();

    mode.toggle();
    expect(mode.isActive).toBe(true);
    mode.unload();
    expect(view.containerEl.hasClass('explorer-multi-select-selection-mode')).toBe(false);
  });

  it('ignores entering twice and exiting while off', () => {
    const mode = loadMode();
    const file = view.tree.addFile('a.md');
    view.tree.selectItem(file);

    mode.exit();
    expect(view.tree.selectedDoms.size).toBe(1);

    mode.enter();
    mode.enter();
    expect(view.containerEl.querySelectorAll('.explorer-multi-select-action-bar')).toHaveLength(1);
  });

  it('removes its button and its bar on unload, and keeps the selection', () => {
    const mode = loadMode();
    const file = view.tree.addFile('a.md');
    mode.enter();
    view.tree.selectItem(file);

    mode.unload();

    expect(view.containerEl.querySelector('.explorer-multi-select-toggle-button')).toBeNull();
    expect(view.containerEl.querySelector('.explorer-multi-select-action-bar')).toBeNull();
    expect(view.tree.selectedDoms.size).toBe(1);
  });

  it('counts the selection and enables the actions that need one', () => {
    const mode = loadMode();
    const folder = view.tree.addFolder('folder');
    const file = view.tree.addFile('a.md');
    mode.enter();

    expect(actionButton('move').hasClass('is-disabled')).toBe(true);
    expect(actionButton('move').getAttribute('aria-disabled')).toBe('true');
    expect(actionButton('select-all').hasClass('is-disabled')).toBe(false);

    view.tree.selectItem(folder);
    view.tree.selectItem(file);
    mode.refresh();

    expect(countText()).toBe('1 file, 1 folder');
    expect(actionButton('move').hasClass('is-disabled')).toBe(false);
    expect(actionButton('delete').getAttribute('aria-disabled')).toBe('false');
  });

  it('does nothing on refresh while off', () => {
    const mode = loadMode();
    mode.refresh();
    expect(countText()).toBeNull();
  });

  it('toggles a row on a plain tap, instead of letting the row open it', () => {
    const mode = loadMode();
    const file = view.tree.addFile('a.md');
    const rowListener = vi.fn();
    file.selfEl.addEventListener('click', rowListener);
    mode.enter();

    const event_ = click(file.selfEl.firstChild ?? file.selfEl);
    expect(view.tree.selectedDoms.has(file)).toBe(true);
    expect(view.tree.activeDom).toBe(file);
    expect(event_.defaultPrevented).toBe(true);
    expect(rowListener).not.toHaveBeenCalled();

    click(file.selfEl);
    expect(view.tree.selectedDoms.has(file)).toBe(false);
  });

  it('leaves to core a tap while off, a modified or non-left click, and a tap on a folder\'s arrow', () => {
    const mode = loadMode();
    const folder = view.tree.addFolder('folder');
    const file = view.tree.addFile('a.md');

    click(file.selfEl);
    expect(view.tree.selectedDoms.size).toBe(0);

    mode.enter();
    for (const init of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      expect(click(file.selfEl, init).defaultPrevented).toBe(false);
    }
    const collapseIconEl = folder.selfEl.querySelector('.collapse-icon');
    expect(click(collapseIconEl ?? folder.selfEl).defaultPrevented).toBe(false);
    expect(view.tree.selectedDoms.size).toBe(0);
  });

  it('ignores a tap that is not on a known row', () => {
    const mode = loadMode();
    const file = view.tree.addFile('a.md');
    mode.enter();

    // Off the rows, inside the header.
    click(view.containerEl.querySelector('.nav-header') ?? view.containerEl);
    // On a row the view no longer maps to a file.
    view.files.delete(file.el);
    click(file.selfEl);
    // On a row mapped to a file the explorer no longer lists.
    const other = view.tree.addFile('b.md');
    delete view.fileItems['b.md'];
    click(other.selfEl);
    // On a row outside the tree.
    const strayEl = view.containerEl.createDiv();
    strayEl.createDiv({ cls: 'tree-item-self' });
    click(strayEl.firstChild ?? strayEl);

    expect(view.tree.selectedDoms.size).toBe(0);
  });

  it('selects every visible row, and inverts the visible rows', () => {
    const mode = loadMode();
    const a = view.tree.addFile('a.md');
    const b = view.tree.addFile('b.md');
    const hidden = view.tree.addFile('hidden.md', undefined, { isHidden: true });
    mode.enter();

    click(actionButton('select-all'));
    expect([...view.tree.selectedDoms]).toEqual([a, b]);

    view.tree.deselectItem(b);
    click(actionButton('invert'));
    expect([...view.tree.selectedDoms]).toEqual([b]);
    expect(view.tree.selectedDoms.has(hidden)).toBe(false);
  });

  it('ignores an action that needs a selection while there is none', () => {
    const mode = loadMode();
    mode.enter();

    click(actionButton('delete'));
    expect(view.onDeleteSelectedFiles).not.toHaveBeenCalled();
  });

  it('moves the selection with core\'s own move item', () => {
    const mode = loadMode();
    const file = view.tree.addFile('a.md');
    const moveCallback = vi.fn();
    const otherCallback = vi.fn();
    const filesMenuListener = vi.fn((menu: Menu) => {
      menu.addSeparator();
      addMenuItem(menu, 'lucide-bookmark', otherCallback);
      addMenuItem(menu, 'lucide-folder-tree', moveCallback);
    });
    app.asOriginalType__().workspace.on('files-menu', filesMenuListener);
    mode.enter();
    view.tree.selectItem(file);

    click(actionButton('move'));

    expect(filesMenuListener).toHaveBeenCalledWith(expect.anything(), [file.file], 'file-explorer-context-menu', view.leaf);
    expect(moveCallback).toHaveBeenCalledOnce();
    expect(otherCallback).not.toHaveBeenCalled();
  });

  it('falls back to core\'s menu when no move item is found', () => {
    const mode = loadMode();
    const file = view.tree.addFile('a.md');
    mode.enter();
    view.tree.selectItem(file);

    const event_ = click(actionButton('move'));

    expect(view.openFileContextMenu).toHaveBeenCalledWith(event_, file.selfEl);
  });

  it('bookmarks the selection with the Bookmarks plugin\'s own item, while that plugin is enabled', () => {
    const bookmarkCallback = vi.fn();
    const onFilesMenu = vi.fn((menu: Menu) => {
      addMenuItem(menu, 'lucide-bookmark', bookmarkCallback);
    });
    const mode = loadMode();
    const file = view.tree.addFile('a.md');
    mode.enter();
    view.tree.selectItem(file);
    mode.refresh();
    expect(actionButton('bookmark').hasClass('is-disabled')).toBe(true);

    bookmarks = { onFilesMenu };
    mode.refresh();
    expect(actionButton('bookmark').hasClass('is-disabled')).toBe(false);
    click(actionButton('bookmark'));

    expect(onFilesMenu).toHaveBeenCalledWith(expect.anything(), [file.file], 'file-explorer-context-menu', view.leaf);
    expect(bookmarkCallback).toHaveBeenCalledOnce();
  });

  it('does nothing when the Bookmarks plugin adds no runnable item', () => {
    const mode = loadMode();
    const file = view.tree.addFile('a.md');
    mode.enter();
    view.tree.selectItem(file);

    bookmarks = { onFilesMenu: vi.fn() };
    expect(() => click(actionButton('bookmark'))).not.toThrow();

    bookmarks = {
      onFilesMenu: (menu: Menu): void => {
        addMenuItem(menu, 'lucide-bookmark');
      }
    };
    expect(() => click(actionButton('bookmark'))).not.toThrow();
  });

  it('deletes the selection through core\'s delete, and opens core\'s menu for it', () => {
    const mode = loadMode();
    const file = view.tree.addFile('a.md');
    mode.enter();
    view.tree.selectItem(file);

    const deleteEvent = click(actionButton('delete'));
    const moreEvent = click(actionButton('more'));

    expect(view.onDeleteSelectedFiles).toHaveBeenCalledWith(deleteEvent);
    expect(deleteSelectionSpy).not.toHaveBeenCalled();
    expect(view.openFileContextMenu).toHaveBeenCalledWith(moreEvent, file.selfEl);
  });

  it('deletes a selection of several rows with the batch delete', () => {
    const mode = loadMode();
    const a = view.tree.addFile('a.md');
    const b = view.tree.addFile('b.md');
    mode.enter();
    view.tree.selectItem(a);
    view.tree.selectItem(b);

    click(actionButton('delete'));

    expect(deleteSelectionSpy).toHaveBeenCalledOnce();
    expect(view.onDeleteSelectedFiles).not.toHaveBeenCalled();
  });

  it('turns off and clears the selection on Done', () => {
    const mode = loadMode();
    const file = view.tree.addFile('a.md');
    mode.enter();
    view.tree.selectItem(file);

    const doneButtonEl = view.containerEl.querySelector('.explorer-multi-select-action-bar-done');
    click(doneButtonEl ?? view.containerEl);

    expect(mode.isActive).toBe(false);
    expect(view.tree.selectedDoms.size).toBe(0);
  });

  describe('long-press', () => {
    it('enters the mode on mobile with the pressed row selected, instead of core\'s menu', () => {
      Platform.isMobile = true;
      const mode = loadMode();
      const file = view.tree.addFile('a.md');

      const event_ = contextMenu(file.selfEl);

      expect(event_.defaultPrevented).toBe(true);
      expect(mode.isActive).toBe(true);
      expect([...view.tree.selectedDoms]).toEqual([file]);
      expect(view.tree.activeDom).toBe(file);
    });

    it('swallows the contextmenu Obsidian dispatches when the finger lifts, then leaves the next one to core', () => {
      vi.useFakeTimers();
      try {
        Platform.isMobile = true;
        loadMode();
        const file = view.tree.addFile('a.md');
        // A lift with nothing to swallow changes nothing.
        file.selfEl.dispatchEvent(new Event('touchend', { bubbles: true }));
        vi.runAllTimers();

        contextMenu(file.selfEl);
        expect(contextMenu(file.selfEl).defaultPrevented).toBe(true);
        file.selfEl.dispatchEvent(new Event('touchend', { bubbles: true }));
        expect(contextMenu(file.selfEl).defaultPrevented).toBe(true);

        vi.runAllTimers();
        expect(contextMenu(file.selfEl).defaultPrevented).toBe(false);
        expect([...view.tree.selectedDoms]).toEqual([file]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('leaves the long-press to core in the mode, with the setting off, on desktop, or off the rows', () => {
      const mode = loadMode();
      const file = view.tree.addFile('a.md');

      Platform.isMobile = false;
      expect(contextMenu(file.selfEl).defaultPrevented).toBe(false);

      Platform.isMobile = true;
      shouldEnterOnLongPress = false;
      expect(contextMenu(file.selfEl).defaultPrevented).toBe(false);

      shouldEnterOnLongPress = true;
      expect(contextMenu(view.containerEl).defaultPrevented).toBe(false);

      mode.enter();
      expect(contextMenu(file.selfEl).defaultPrevented).toBe(false);
      expect(view.tree.selectedDoms.size).toBe(0);
    });
  });
});

describe('getEventTargetElement', () => {
  it('returns the element an event happened on, and null for any other target', () => {
    const el = createDiv();
    const spanEl = el.createSpan();
    const textNode = document.createTextNode('text');
    spanEl.append(textNode);
    let elementTarget: Element | null | undefined;
    let textTarget: Element | null | undefined;
    el.addEventListener('click', (event_) => {
      if (event_.target === el) {
        elementTarget = getEventTargetElement(event_);
      } else {
        textTarget = getEventTargetElement(event_);
      }
    });

    el.dispatchEvent(new MouseEvent('click'));
    textNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(elementTarget).toBe(el);
    expect(textTarget).toBeNull();
    expect(getEventTargetElement(new MouseEvent('click'))).toBeNull();
  });
});
