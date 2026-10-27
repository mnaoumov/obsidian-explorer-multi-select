import type {
  App,
  TAbstractFile
} from 'obsidian';

import {
  TFile,
  TFolder
} from 'obsidian';

import type { SelectionCount } from '../selection-core/explorer-tree-items.ts';

/**
 * The extensions core never counts as attachments when it cleans up after a deleted note.
 */
const NON_ATTACHMENT_EXTENSIONS: ReadonlySet<string> = new Set(['base', 'canvas', 'md']);

/**
 * What a batch delete removes, and what the user should hear about before it does.
 */
export interface BatchDeletePlan {
  /**
   * The attachments that only the deleted notes link to, which core's `Delete unlinked attachments` setting
   * cleans up.
   */
  readonly attachments: readonly TFile[];
  /**
   * How many links from notes that stay point into what is deleted.
   */
  readonly brokenLinkCount: number;
  /**
   * The files and folders to delete, without the ones inside a folder that is deleted too.
   */
  readonly files: readonly TAbstractFile[];
  /**
   * Tells whether a path is deleted: it is one of {@link BatchDeletePlan.files} or inside one of them.
   */
  readonly isDeleted: (path: string) => boolean;
  /**
   * How many of the folders to delete hold something.
   */
  readonly nonEmptyFolderCount: number;
}

/**
 * Counts the files and the folders among the given files.
 *
 * @param files - The files and folders.
 * @returns The two counts.
 */
export function countFiles(files: readonly TAbstractFile[]): SelectionCount {
  const folderCount = files.filter((file) => file instanceof TFolder).length;
  return { fileCount: files.length - folderCount, folderCount };
}

/**
 * Deletes what a plan names through `FileManager.trashFile`, which follows the user's `Deleted files`
 * setting: the system trash, the vault's `.trash` folder, or permanently.
 *
 * @param app - The app.
 * @param plan - The plan.
 * @param shouldDeleteAttachments - Whether to delete the plan's attachments too.
 */
export async function deleteByPlan(app: App, plan: BatchDeletePlan, shouldDeleteAttachments: boolean): Promise<void> {
  const files = shouldDeleteAttachments ? [...plan.files, ...plan.attachments] : plan.files;
  for (const file of files) {
    // The vault may have changed while the confirmation was open.
    if (app.vault.getAbstractFileByPath(file.path) !== file) {
      continue;
    }
    await app.fileManager.trashFile(file);
  }
}

/**
 * Works out what deleting the given files and folders removes, the way core's own prompt does for one of
 * them.
 *
 * @param app - The app.
 * @param selectedFiles - The selected files and folders.
 * @returns The plan.
 */
export function planBatchDelete(app: App, selectedFiles: readonly TAbstractFile[]): BatchDeletePlan {
  const candidates = selectedFiles.filter((file) => !(file instanceof TFolder && file.isRoot()));
  const folderPaths = candidates.filter((file) => file instanceof TFolder).map((folder) => folder.path);
  function isInsideFolder(path: string): boolean {
    return folderPaths.some((folderPath) => path.startsWith(`${folderPath}/`));
  }
  const files = candidates.filter((file) => !isInsideFolder(file.path));
  const filePaths = new Set(files.map((file) => file.path));
  function isDeleted(path: string): boolean {
    return filePaths.has(path) || isInsideFolder(path);
  }

  const resolvedLinks = app.metadataCache.resolvedLinks;
  let brokenLinkCount = 0;
  for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
    if (isDeleted(sourcePath)) {
      continue;
    }
    for (const [targetPath, count] of Object.entries(links)) {
      if (isDeleted(targetPath)) {
        brokenLinkCount += count;
      }
    }
  }

  return {
    attachments: findOrphanedAttachments(app, files, isDeleted),
    brokenLinkCount,
    files,
    isDeleted,
    nonEmptyFolderCount: files.filter((file) => file instanceof TFolder && file.children.length > 0).length
  };
}

/**
 * Finds the attachments that only deleted notes link to. Like core, it looks at the links of the notes that
 * are deleted themselves, not at the notes inside a deleted folder.
 *
 * @param app - The app.
 * @param files - The files and folders to delete.
 * @param isDeleted - Tells whether a path is deleted.
 * @returns The attachments.
 */
function findOrphanedAttachments(app: App, files: readonly TAbstractFile[], isDeleted: (path: string) => boolean): TFile[] {
  const resolvedLinks = app.metadataCache.resolvedLinks;
  const candidatePaths = new Set<string>();
  for (const file of files) {
    if (!(file instanceof TFile)) {
      continue;
    }
    for (const targetPath of Object.keys(resolvedLinks[file.path] ?? {})) {
      if (!isDeleted(targetPath) && !NON_ATTACHMENT_EXTENSIONS.has(getExtension(targetPath))) {
        candidatePaths.add(targetPath);
      }
    }
  }

  for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
    if (isDeleted(sourcePath)) {
      continue;
    }
    for (const targetPath of Object.keys(links)) {
      candidatePaths.delete(targetPath);
    }
  }

  const attachments: TFile[] = [];
  for (const path of candidatePaths) {
    const attachment = app.vault.getFileByPath(path);
    if (attachment) {
      attachments.push(attachment);
    }
  }
  return attachments;
}

function getExtension(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dotIndex = name.lastIndexOf('.');
  return dotIndex === -1 ? '' : name.slice(dotIndex + 1).toLowerCase();
}
