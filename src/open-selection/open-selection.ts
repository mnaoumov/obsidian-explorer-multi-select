import type {
  App,
  PaneType,
  TAbstractFile,
  WorkspaceLeaf
} from 'obsidian';

import { TFile } from 'obsidian';

/**
 * Where {@link openFiles} puts the files: each in a new tab of the current window, or all of them as the tabs
 * of one new window.
 */
export type OpenFilesTarget = 'tab' | 'window';

/**
 * Keeps the files of a selection that can be opened, in their given order. Folders are dropped.
 *
 * @param files - The selection's files and folders.
 * @returns The files.
 */
export function getOpenableFiles(files: readonly TAbstractFile[]): TFile[] {
  return files.filter((file): file is TFile => file instanceof TFile);
}

/**
 * Opens files in new tabs, in their given order. The idea comes from `Sidebar Keyboard Navigation`, which opens
 * the selection in a new window through internal leaf APIs; this uses the public `getLeaf` only.
 *
 * Each file opens in a new tab beside the active one and becomes active, so the next tab goes after it. For
 * `window`, the first file opens a new window, so every later tab joins that window.
 *
 * @param app - The app.
 * @param files - The files.
 * @param target - Where the files go.
 * @returns The leaves the files were opened in.
 */
export async function openFiles(app: App, files: readonly TFile[], target: OpenFilesTarget): Promise<WorkspaceLeaf[]> {
  const leaves: WorkspaceLeaf[] = [];
  for (const file of files) {
    const paneType: PaneType = target === 'window' && leaves.length === 0 ? 'window' : 'tab';
    const leaf = app.workspace.getLeaf(paneType);
    await leaf.openFile(file, { active: true });
    leaves.push(leaf);
  }
  return leaves;
}
