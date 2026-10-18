/**
 * @file
 *
 * The staging closures the desktop and the Android capture suites share. Each frame is staged by `startStage`,
 * which sets it up and returns at once, and is read by `pollStage` until it shows what the frame needs, both
 * through `pollInObsidian`, so every wait happens in Node and no closure comes near the transport's per-eval cap.
 *
 * Both functions are serialized into Obsidian, so neither may reach anything outside its own body: every constant
 * and helper they use is declared inside them.
 */

import type {
  FileExplorerView,
  FileTreeItem,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';
import type { WorkspaceLeaf } from 'obsidian';
import type { CommonArguments } from 'obsidian-integration-testing';

/**
 * What {@link reserveCaptionBand} is given.
 */
export interface ReserveCaptionBandInput {
  /**
   * The height of the caption band `labelScreenshot` draws over the bottom of the frame.
   */
  readonly bandHeightInPixels: number;
}

/**
 * A frame the capture suites can stage.
 */
export type ScreenshotStage = 'batch-delete' | 'more-menu' | 'rule-prompt' | 'selection-count' | 'selection-mode' | 'settings';

/**
 * What a stage closure is given.
 */
export interface StageInput {
  /**
   * The demo note to open in the main area, or `null` to leave the main area as it is.
   */
  readonly notePath: null | string;

  /**
   * The frame to stage.
   */
  readonly stage: ScreenshotStage;
}

/**
 * Reads whether the metadata cache has resolved the links of every note.
 *
 * Until it has, the status bar's count of links to the open note is still climbing, so a frame taken earlier differs
 * from one taken on the next run.
 *
 * @param params - The closure arguments.
 * @returns Whether every note's links are resolved.
 */
export function areAllLinksResolved({ app }: CommonArguments): boolean {
  return app.vault.getMarkdownFiles().every((file) => Object.hasOwn(app.metadataCache.resolvedLinks, file.path));
}

/**
 * Reads whether the staged frame is ready: the note behind it has rendered its buttons, and the plugin shows
 * what the frame is about.
 *
 * @param params - The closure arguments.
 * @returns What the frame shows, or an empty string while it is not ready.
 */
export function pollStage({ app, notePath, stage }: CommonArguments & StageInput): string {
  const PLUGIN_ID = 'explorer-multi-select';

  if (notePath !== null && !isNoteRendered(notePath)) {
    return '';
  }

  const readers: Record<ScreenshotStage, () => string> = {
    'batch-delete': () =>
      activeDocument.querySelector(':scope .modal-container .explorer-multi-select-batch-delete')?.closest('.modal')?.querySelector('.modal-title')
        ?.textContent ?? '',
    'more-menu': () => activeDocument.querySelectorAll(':scope .menu .menu-item').length > 0 ? 'menu' : '',
    'rule-prompt': () => {
      const inputEl = activeDocument.querySelector<HTMLInputElement>(':scope .modal-container input[type="text"]');
      const title = activeDocument.querySelector(':scope .modal-container .modal-title')?.textContent ?? '';
      return inputEl?.value ? `${title}: ${inputEl.value}` : '';
    },
    'selection-count': () => activeDocument.querySelector(':scope .explorer-multi-select-status-bar-item')?.textContent ?? '',
    'selection-mode': () => activeDocument.querySelector(':scope .explorer-multi-select-action-bar-count')?.textContent ?? '',
    'settings': () => app.setting.activeTab?.id === PLUGIN_ID && app.setting.activeTab.containerEl.querySelector('.setting-item-name') ? 'settings' : ''
  };
  return readers[stage]();

  function isNoteRendered(path: string): boolean {
    const leaf = app.workspace.getLeavesOfType('markdown').find((markdownLeaf) => markdownLeaf.getViewState().state?.['file'] === path);
    const previewEl = leaf?.view.containerEl.querySelector('.markdown-preview-view');
    // Until `CodeScript Toolkit` has rendered a button, its fence shows as a plain code block.
    return !!previewEl?.querySelector('h1') && !previewEl.querySelector('code.language-code-button');
  }
}

/**
 * Lays the app out above the caption band rather than under it.
 *
 * `labelScreenshot` draws its band over the bottom of the frame, on the grounds that the bottom is chrome. Here it
 * is not: the status-bar count and the selection mode's action bar both sit at the very bottom, so the band would
 * hide what two of the frames are about.
 *
 * @param params - The closure arguments.
 */
export function reserveCaptionBand({ bandHeightInPixels }: CommonArguments & ReserveCaptionBandInput): void {
  activeDocument.querySelector<HTMLElement>(':scope .app-container')?.setCssStyles({ height: `calc(100% - ${String(bandHeightInPixels)}px)` });
  // The status bar is fixed to the viewport rather than laid out in the app, so it is lifted on its own.
  activeDocument.querySelector<HTMLElement>(':scope .status-bar')?.setCssStyles({ bottom: `${String(bandHeightInPixels)}px` });
}

/**
 * Stages a frame: dismisses whatever the last frame left open, opens the note behind it, and sets the File
 * explorer up for it.
 *
 * @param params - The closure arguments.
 */
export async function startStage({ app, lib, notePath, obsidianModule, stage }: CommonArguments & StageInput): Promise<void> {
  const PLUGIN_ID = 'explorer-multi-select';
  const SELECTION_MODE_CLASS = 'explorer-multi-select-selection-mode';
  const SELECTION_MODE_FOLDER = 'Materials/01 Selection mode';
  const RULE_FOLDER = 'Materials/04 Select by rule';
  const BATCH_DELETE_FOLDER = 'Materials/05 Batch delete';
  const BATCH_DELETE_NOTE_NAMES = ['Draft 1', 'Draft 2', 'Draft 3'];
  const GLOB_PATTERN = '*a*';
  const WAIT_TIMEOUT_IN_MILLISECONDS = 5000;

  dismissLeftovers();
  await lib.waitUntil({
    message: 'the last frame\'s modal to close',
    predicate: () => activeDocument.querySelector(':scope .modal-container') === null,
    timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
  });

  if (notePath !== null) {
    const leaf = app.workspace.getLeaf(false);
    await leaf.setViewState({ active: true, state: { file: notePath, mode: 'preview' }, type: 'markdown' });
  }

  // The rule prompt keeps the drawer open on a phone, so its folder shows behind the prompt that names it.
  const DRAWER_STAGES: readonly ScreenshotStage[] = ['more-menu', 'rule-prompt', 'selection-count', 'selection-mode'];
  const view = await revealExplorer(DRAWER_STAGES.includes(stage));

  switch (stage) {
    case 'batch-delete': {
      await setSelectionMode(view, false);
      if (!app.vault.getFolderByPath(BATCH_DELETE_FOLDER)) {
        await app.vault.createFolder(BATCH_DELETE_FOLDER);
      }
      const paths = BATCH_DELETE_NOTE_NAMES.map((name) => `${BATCH_DELETE_FOLDER}/${name}.md`);
      for (const path of paths) {
        if (!app.vault.getFileByPath(path)) {
          await app.vault.create(path, `# ${path.slice(path.lastIndexOf('/') + 1, -'.md'.length)}\n\nA throwaway note, created to be deleted.\n`);
        }
      }
      await lib.waitUntil({
        message: 'the drafts in the File explorer',
        predicate: () => paths.every((path) => view.fileItems[path] !== undefined),
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      });
      await showOnly(view, ['Materials', BATCH_DELETE_FOLDER]);
      select(view, paths);
      // The Delete key's handler. It resolves only once the confirmation closes, so it is not awaited.
      view.tree.handleDeleteSelectedItems(new KeyboardEvent('keydown', { key: 'Delete' })).catch((error: unknown) => {
        console.error(error);
      });
      break;
    }
    case 'more-menu':
    case 'selection-mode': {
      await showOnly(view, ['Materials', SELECTION_MODE_FOLDER, `${SELECTION_MODE_FOLDER}/Fruit basket`]);
      await setSelectionMode(view, true);
      select(view, [`${SELECTION_MODE_FOLDER}/Apple.md`, `${SELECTION_MODE_FOLDER}/Cherry.md`, `${SELECTION_MODE_FOLDER}/Fruit basket`]);
      if (stage === 'more-menu') {
        await lib.waitUntil({
          message: 'the More button on screen',
          predicate: () => getElement(view, '[data-action="more"]').getBoundingClientRect().width > 0,
          timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
        });
        await lib.clickElement({ element: getElement(view, '[data-action="more"]') });
      }
      break;
    }
    case 'rule-prompt': {
      await setSelectionMode(view, false);
      await showOnly(view, ['Materials', RULE_FOLDER]);
      view.tree.clearSelectedDoms();
      focus(view, RULE_FOLDER);
      app.commands.executeCommandById(`${PLUGIN_ID}:select-by-glob-pattern`);
      await lib.waitUntil({
        message: 'the glob pattern prompt',
        predicate: () => getPromptInput() !== null,
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      });
      const inputEl = getPromptInput();
      if (!inputEl) {
        throw new Error('The glob pattern prompt has no input.');
      }
      inputEl.value = GLOB_PATTERN;
      inputEl.dispatchEvent(new Event('input'));
      // On a phone the focused input raises the soft keyboard over half the frame.
      if (obsidianModule.Platform.isMobile) {
        inputEl.blur();
      }
      break;
    }
    case 'selection-count': {
      await setSelectionMode(view, false);
      await showOnly(view, ['Materials', RULE_FOLDER]);
      const folderItem = view.fileItems[RULE_FOLDER] as FolderTreeItem;
      select(view, folderItem.vChildren.children.map((child) => child.file.path));
      focus(view, RULE_FOLDER);
      break;
    }
    case 'settings': {
      await setSelectionMode(view, false);
      view.tree.clearSelectedDoms();
      // On mobile the settings modal is not in the document until something attaches it.
      const { containerEl } = app.setting;
      if (!activeDocument.body.contains(containerEl)) {
        activeDocument.body.append(containerEl);
      }
      app.setting.open();
      app.setting.openTabById(PLUGIN_ID);
      break;
    }
    default: {
      break;
    }
  }

  function dismissLeftovers(): void {
    // On a phone, closing settings that are not open hides the drawer while leaving it marked open.
    if (activeDocument.body.contains(app.setting.containerEl)) {
      app.setting.close();
    }
    // The prompts' Cancel is `cancel-button`, the batch delete's is `mod-cancel`.
    for (const buttonEl of activeDocument.querySelectorAll<HTMLElement>(':scope .modal-container .cancel-button, :scope .modal-container .mod-cancel')) {
      buttonEl.click();
    }
    for (const el of activeDocument.querySelectorAll(':scope .menu, :scope .notice, :scope .tooltip')) {
      el.detach();
    }
  }

  function focus(explorerView: FileExplorerView, path: string): void {
    const item = explorerView.fileItems[path];
    if (!item) {
      throw new Error(`No row for ${path}.`);
    }
    explorerView.tree.setFocusedItem(item, true);
  }

  function getElement(explorerView: FileExplorerView, selector: string): HTMLElement {
    const el = explorerView.containerEl.querySelector(selector);
    if (!(el instanceof HTMLElement)) {
      throw new TypeError(`No element matches ${selector}.`);
    }
    return el;
  }

  function getExplorerLeaf(): WorkspaceLeaf {
    const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
    if (!leaf) {
      throw new Error('No File explorer leaf.');
    }
    return leaf;
  }

  function getPromptInput(): HTMLInputElement | null {
    return activeDocument.querySelector(':scope .modal-container input[type="text"]');
  }

  function isFolderItem(item: FileTreeItem | FolderTreeItem): item is FolderTreeItem {
    return 'vChildren' in item;
  }

  async function revealExplorer(shouldOpenDrawer: boolean): Promise<FileExplorerView> {
    const leaf = getExplorerLeaf();
    await leaf.loadIfDeferred();
    // A phone shows the explorer in a drawer that covers the note, so only the frames about the explorer open it.
    const explorerView = leaf.view as FileExplorerView;
    const DRAWER_SLIDE_DELAY_IN_MILLISECONDS = 1000;
    app.workspace.leftSplit.expand();
    if (shouldOpenDrawer || !obsidianModule.Platform.isMobile) {
      await app.workspace.revealLeaf(leaf);
      await sleep(DRAWER_SLIDE_DELAY_IN_MILLISECONDS);
      // A phone's drawer can stay marked open while it is hidden. Collapsing it and opening it again resets it.
      if (explorerView.containerEl.getBoundingClientRect().width === 0) {
        app.workspace.leftSplit.collapse();
        await sleep(DRAWER_SLIDE_DELAY_IN_MILLISECONDS);
        app.workspace.leftSplit.expand();
        await app.workspace.revealLeaf(leaf);
        await sleep(DRAWER_SLIDE_DELAY_IN_MILLISECONDS);
      }
    } else {
      /*
       * After core's menu the drawer can be marked shut while the note is still pushed aside for it, so a plain
       * `collapse` changes nothing. Opening it first and then shutting it puts both back in step.
       */
      await sleep(DRAWER_SLIDE_DELAY_IN_MILLISECONDS);
      app.workspace.leftSplit.collapse();
      await sleep(DRAWER_SLIDE_DELAY_IN_MILLISECONDS);
    }
    return explorerView;
  }

  function select(explorerView: FileExplorerView, paths: readonly string[]): void {
    explorerView.tree.clearSelectedDoms();
    for (const path of paths) {
      const item = explorerView.fileItems[path];
      if (!item) {
        throw new Error(`No row for ${path}.`);
      }
      explorerView.tree.selectItem(item);
    }
  }

  async function setSelectionMode(explorerView: FileExplorerView, isOn: boolean): Promise<void> {
    if (explorerView.containerEl.hasClass(SELECTION_MODE_CLASS) !== isOn) {
      app.commands.executeCommandById(`${PLUGIN_ID}:toggle-selection-mode`);
    }
    await lib.waitUntil({
      message: `selection mode ${isOn ? 'on' : 'off'}`,
      predicate: () => explorerView.containerEl.hasClass(SELECTION_MODE_CLASS) === isOn,
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
    });
  }

  /**
   * Expands the given folders and collapses every other one, so the tree shows just what the frame is about.
   */
  async function showOnly(explorerView: FileExplorerView, expandedPaths: readonly string[]): Promise<void> {
    for (const item of Object.values(explorerView.fileItems)) {
      if (isFolderItem(item) && item.file.path !== '/') {
        await item.setCollapsed(!expandedPaths.includes(item.file.path));
      }
    }
  }
}
