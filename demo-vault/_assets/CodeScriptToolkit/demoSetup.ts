import type {
  FileExplorerView,
  FileTreeItem,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import { configureCommunityPlugin } from '@mnaoumov/obsidian-lib/community-plugins';
import { Notice } from 'obsidian';

// Shared code for every `code-button` in this vault, so each note's button stays a one-liner instead of a
// Block copy-pasted across notes.
//
// The plugin id has to match `manifest.json` exactly: commands are keyed by it, and so is `data.json`.
const PLUGIN_ID = 'explorer-multi-select';

const BATCH_DELETE_FOLDER_PATH = 'Materials/05 Batch delete';
const BATCH_DELETE_NOTE_NAMES = ['Draft 1', 'Draft 2', 'Draft 3'];

type ExplorerRow = FileTreeItem | FolderTreeItem;

/**
 * The settings this vault's buttons change, by the key each is stored under in `data.json`.
 */
type BooleanSettingKey = 'shouldEnterSelectionModeOnLongPress' | 'shouldKeepSelectionOnClick' | 'shouldToggleSelectionOnCtrlOrCommandClick';

const DEFAULT_SETTINGS: Record<BooleanSettingKey, boolean> = {
  shouldEnterSelectionModeOnLongPress: true,
  shouldKeepSelectionOnClick: false,
  shouldToggleSelectionOnCtrlOrCommandClick: false
};

/**
 * Clears the File explorer's selection.
 *
 * Manual equivalent: click empty space in the File explorer, or press `Esc` there.
 */
export async function clearSelection(app: App): Promise<void> {
  const view = await revealExplorer(app);
  if (!view) {
    return;
  }
  view.tree.clearSelectedDoms();
  new Notice('The selection is empty again.');
}

/**
 * Clears the File explorer's filter.
 *
 * Manual equivalent: empty the filter field at the top of the File explorer.
 */
export async function clearExplorerFilter(app: App): Promise<void> {
  const view = await revealExplorer(app);
  if (!view) {
    return;
  }
  view.onSearchChanged('');
  new Notice('The File explorer shows every row again.');
}

/**
 * Creates three throwaway notes to delete, and selects them.
 *
 * Manual equivalent: create a few notes in a folder, then Alt-click (Option-click on macOS) each one.
 */
export async function createAndSelectNotesToDelete(app: App): Promise<void> {
  if (!app.vault.getFolderByPath(BATCH_DELETE_FOLDER_PATH)) {
    await app.vault.createFolder(BATCH_DELETE_FOLDER_PATH);
  }
  const paths: string[] = [];
  for (const name of BATCH_DELETE_NOTE_NAMES) {
    const path = `${BATCH_DELETE_FOLDER_PATH}/${name}.md`;
    if (!app.vault.getFileByPath(path)) {
      await app.vault.create(path, `# ${name}\n\nA throwaway note, created to be deleted.\n`);
    }
    paths.push(path);
  }
  await selectPaths(app, paths, `Selected ${String(paths.length)} notes in ${BATCH_DELETE_FOLDER_PATH}.`);
}

/**
 * Deletes the File explorer's selection the way the Delete key does, so the plugin's one confirmation opens.
 *
 * Manual equivalent: press `Delete` in the File explorer (`Cmd+Backspace` on macOS).
 */
export async function deleteSelection(app: App): Promise<void> {
  const view = await revealExplorer(app);
  if (!view) {
    return;
  }
  if (view.tree.selectedDoms.size === 0) {
    new Notice('Nothing is selected. Press the button above first.');
    return;
  }
  // The handler is the Delete key's, so it takes the key event it would have been given.
  await view.tree.handleDeleteSelectedItems?.(new KeyboardEvent('keydown', { key: 'Delete' }));
}

/**
 * Filters the File explorer to the rows whose path contains the given text.
 *
 * Manual equivalent: type the same text into the filter field at the top of the File explorer.
 */
export async function filterExplorer(app: App, query: string): Promise<void> {
  const view = await revealExplorer(app);
  if (!view) {
    return;
  }
  view.onSearchChanged(query);
  new Notice(`The File explorer now shows only the rows matching "${query}".`);
}

/**
 * Moves the File explorer's focus to a row and gives the explorer the keyboard, so its keys act on that row.
 *
 * Manual equivalent: click the row, then press `Esc` to clear the selection the click made.
 */
export async function focusRow(app: App, path: string): Promise<void> {
  const view = await revealExplorer(app);
  if (!view) {
    return;
  }
  const row = await revealRow(view, path);
  if (!row) {
    return;
  }
  view.tree.clearSelectedDoms();
  view.tree.setFocusedItem(row, true);
  const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
  if (leaf) {
    app.workspace.setActiveLeaf(leaf, { focus: true });
  }
  new Notice(`${path} has the focus. Press keys now, before clicking anywhere else.`);
}

/**
 * Puts every setting this vault's buttons change back to the value a fresh install starts with.
 *
 * Manual equivalent: set each toggle in the settings tab back to its default.
 */
export async function resetSettings(app: App): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: { ...DEFAULT_SETTINGS } });
  new Notice('Every setting is back to its default.');
}

/**
 * Runs one of the plugin's commands with the given folder focused in the File explorer, so a select-by-rule
 * command applies to that folder.
 *
 * Manual equivalent: click the folder in the File explorer, then run the command from the Command Palette.
 */
export async function runCommandInFolder(app: App, folderPath: string, commandName: string): Promise<void> {
  const view = await revealExplorer(app);
  if (!view) {
    return;
  }
  const folderRow = await revealRow(view, folderPath);
  if (!folderRow) {
    return;
  }
  view.tree.setFocusedItem(folderRow, true);
  runCommand(app, commandName);
}

/**
 * Runs one of the plugin's commands.
 *
 * Manual equivalent: run the command from the Command Palette (`Ctrl+P` / `Cmd+P`).
 */
export function runCommand(app: App, commandName: string): void {
  if (!app.commands.executeCommandById(`${PLUGIN_ID}:${commandName}`)) {
    new Notice(`The command ${commandName} cannot run right now. Is the File explorer open?`);
  }
}

/**
 * Selects every row directly inside a folder, the way `Ctrl+A` / `Cmd+A` does when that folder has the focus.
 *
 * Manual equivalent: click a row in the folder, then press `Ctrl+A` / `Cmd+A` in the File explorer.
 */
export async function selectAllInFolder(app: App, folderPath: string): Promise<void> {
  const view = await revealExplorer(app);
  if (!view) {
    return;
  }
  const folderRow = await revealRow(view, folderPath);
  if (!folderRow || !isFolderRow(folderRow)) {
    return;
  }
  await folderRow.setCollapsed(false);
  view.tree.clearSelectedDoms();
  for (const child of folderRow.vChildren.children) {
    view.tree.selectItem(child);
  }
  view.tree.setFocusedItem(folderRow, true);
  new Notice(`Selected everything in ${folderPath}. Look at the status bar for the count.`);
}

/**
 * Selects the given rows, and nothing else.
 *
 * Manual equivalent: Alt-click (Option-click on macOS) each row.
 */
export async function selectPaths(app: App, paths: readonly string[], message?: string): Promise<void> {
  const view = await revealExplorer(app);
  if (!view) {
    return;
  }
  view.tree.clearSelectedDoms();
  for (const path of paths) {
    const row = await revealRow(view, path);
    if (row) {
      view.tree.selectItem(row);
    }
  }
  new Notice(message ?? `Selected ${String(view.tree.selectedDoms.size)} rows. Look at the status bar for the count.`);
}

/**
 * Turns one of the plugin's settings on or off. The change applies live, with no reload.
 *
 * Manual equivalent: flip the same toggle in **Settings -> Community plugins -> Explorer Multi-Select**.
 */
export async function setSetting(app: App, key: BooleanSettingKey, value: boolean): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: { [key]: value } });
  new Notice(`${key} is now ${String(value)}. It is live, so no reload is needed.`);
}

function isFolderRow(row: ExplorerRow): row is FolderTreeItem {
  return 'vChildren' in row;
}

async function revealExplorer(app: App): Promise<FileExplorerView | null> {
  const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
  if (!leaf) {
    new Notice('The File explorer is closed. Open it with the "Files: Show file explorer" command, then press the button again.');
    return null;
  }
  await leaf.loadIfDeferred();
  await app.workspace.revealLeaf(leaf);
  return leaf.view as FileExplorerView;
}

/**
 * Expands every folder above a row, so the row is on screen.
 */
async function revealRow(view: FileExplorerView, path: string): Promise<ExplorerRow | null> {
  const parts = path.split('/');
  for (let index = 1; index < parts.length; index++) {
    const ancestor = view.fileItems[parts.slice(0, index).join('/')];
    if (ancestor && isFolderRow(ancestor)) {
      await ancestor.setCollapsed(false);
    }
  }
  const row = view.fileItems[path];
  if (!row) {
    new Notice(`The File explorer has no row for ${path}.`);
    return null;
  }
  return row;
}
