import type {
  FileExplorerView,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

// Desktop-only: the prompts take typed text, and the commands behave the same on mobile apart from entering the
// Selection mode, which the unit tests cover.
// Isolation: `npx vitest run --project integration-tests:desktop src/select-by-rule.desktop.integration.test.ts`.

interface FilterResult {
  readonly afterInvert: string[];
  readonly byFilter: string[];
  readonly isFilterCommandAvailableWithFilter: boolean;
  readonly isFilterCommandAvailableWithoutFilter: boolean;
}

interface PromptResult {
  readonly byExtension: string[];
  readonly byGlobPattern: string[];
  readonly byPropertyValue: string[];
  readonly titles: string[];
}

const FOLDER = 'ems-rule';

describe('select-by-rule commands in the File explorer', () => {
  it('select by extension, glob pattern and property value in the focused folder', async () => {
    const result = await evalInObsidian({
      async callback({ app, folder, lib: { clickElement, waitUntil } }): Promise<PromptResult> {
        // Twelve waits share the transport's 30 s cap per closure; each settles in well under a second.
        const WAIT_TIMEOUT_IN_MILLISECONDS = 2000;
        const titles: string[] = [];

        await app.vault.createFolder(folder);
        await app.vault.createFolder(`${folder}/sub`);
        await app.vault.create(`${folder}/a.md`, '---\nstatus: Done\n---\n');
        await app.vault.create(`${folder}/b.md`, '---\nstatus: open\n---\n');
        await app.vault.create(`${folder}/c.canvas`, '{}');
        await app.vault.create(`${folder}/sub/d.md`, 'd');

        const view = await revealExplorer();
        await waitFor('the rows and the metadata', () =>
          view.fileItems[`${folder}/sub/d.md`] !== undefined
          && app.metadataCache.getCache(`${folder}/b.md`)?.frontmatter?.['status'] === 'open');
        await (view.fileItems[folder] as FolderTreeItem).setCollapsed(false);
        const a = view.fileItems[`${folder}/a.md`];
        if (!a) {
          throw new Error('No row for a.md.');
        }
        view.tree.setFocusedItem(a, false);

        app.commands.executeCommandById('explorer-multi-select:select-by-extension');
        await answerPrompt('md');
        await waitFor('the extension rule', () => view.tree.selectedDoms.size === 2);
        const byExtension = getSelectedPaths();

        view.tree.clearSelectedDoms();
        app.commands.executeCommandById('explorer-multi-select:select-by-glob-pattern');
        await answerPrompt('sub/*', true);
        await waitFor('the glob rule', () => view.tree.selectedDoms.size === 1);
        const byGlobPattern = getSelectedPaths();

        view.tree.clearSelectedDoms();
        app.commands.executeCommandById('explorer-multi-select:select-by-property-value');
        await waitFor('the property picker', () => getSuggestion('status') !== null);
        const suggestionEl = getSuggestion('status');
        if (!suggestionEl) {
          throw new Error('No status suggestion.');
        }
        await clickElement({ element: suggestionEl });
        await waitFor('the property picker to close', () => document.querySelector('.select-item-modal') === null);
        await answerPrompt('done');
        await waitFor('the property rule', () => view.tree.selectedDoms.size === 1);
        const byPropertyValue = getSelectedPaths();
        view.tree.clearSelectedDoms();

        return { byExtension, byGlobPattern, byPropertyValue, titles };

        async function answerPrompt(value: string, shouldToggleIncludeSubfolders = false): Promise<void> {
          await waitFor('the prompt', () => getPromptInput() !== null);
          if (shouldToggleIncludeSubfolders) {
            const checkboxEl = document.querySelector('.modal-container input[type="checkbox"]');
            await clickElement({ element: checkboxEl as HTMLElement });
          }
          titles.push(document.querySelector('.modal-container .modal-title')?.textContent ?? '');
          const inputEl = getPromptInput();
          if (!inputEl) {
            throw new Error('No prompt input.');
          }
          inputEl.value = value;
          inputEl.dispatchEvent(new Event('input'));
          const okButtonEl = [...document.querySelectorAll('.modal-container button')].find((el) => el.textContent === 'Select');
          await clickElement({ element: okButtonEl as HTMLElement });
          await waitFor('the prompt to close', () => document.querySelector('.modal-container') === null);
        }

        function getPromptInput(): HTMLInputElement | null {
          return document.querySelector('.modal-container input[type="text"]');
        }

        function getSelectedPaths(): string[] {
          return [...view.tree.selectedDoms].map((item) => item.file.path).sort();
        }

        function getSuggestion(text: string): HTMLElement | null {
          return [...document.querySelectorAll<HTMLElement>('.modal-container .prompt-results .suggestion-item')].find((el) => el.textContent === text) ?? null;
        }

        async function revealExplorer(): Promise<FileExplorerView> {
          const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
          if (!leaf) {
            throw new Error('No File explorer leaf.');
          }
          await leaf.loadIfDeferred();
          await app.workspace.revealLeaf(leaf);
          return leaf.view as FileExplorerView;
        }

        async function waitFor(step: string, isReady: () => boolean): Promise<void> {
          try {
            await waitUntil({ predicate: isReady, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
          } catch (error) {
            throw new Error(`Timed out waiting for ${step}.`, { cause: error });
          }
        }
      },
      input: { folder: FOLDER },
      vaultPath: getTemporaryVault().path
    });

    expect(result.titles).toEqual([
      `Select files by extension in ${FOLDER}`,
      `Select by glob pattern in ${FOLDER}`,
      `Select notes whose status is in ${FOLDER}`
    ]);
    expect(result.byExtension).toEqual([`${FOLDER}/a.md`, `${FOLDER}/b.md`]);
    expect(result.byGlobPattern).toEqual([`${FOLDER}/sub/d.md`]);
    expect(result.byPropertyValue).toEqual([`${FOLDER}/a.md`]);
  });

  it('selects the files matching the explorer\'s filter, and inverts the selection', async () => {
    const result = await evalInObsidian({
      async callback({ app, folder, lib: { waitUntil } }): Promise<FilterResult> {
        const WAIT_TIMEOUT_IN_MILLISECONDS = 2500;
        const COMMAND_ID = 'explorer-multi-select:select-filter-matches';
        const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
        if (!leaf) {
          throw new Error('No File explorer leaf.');
        }
        await app.workspace.revealLeaf(leaf);
        const view = leaf.view as FileExplorerView;

        const isFilterCommandAvailableWithoutFilter = app.commands.findCommand(COMMAND_ID)?.checkCallback?.(true) === true;
        view.onSearchChanged(`${folder}/b`);
        const isFilterCommandAvailableWithFilter = app.commands.findCommand(COMMAND_ID)?.checkCallback?.(true) === true;
        app.commands.executeCommandById(COMMAND_ID);
        await waitFor('the filter rule', () => view.tree.selectedDoms.size > 0);
        const byFilter = getSelectedPaths();

        const a = view.fileItems[`${folder}/a.md`];
        if (!a) {
          throw new Error('No row for a.md.');
        }
        view.onSearchChanged('');
        // Core refilters the rows after the query changes, not during the call.
        await waitFor('the filter to clear', () => !a.info.hidden && !a.el.hasClass('is-filtered-out'));
        view.tree.clearSelectedDoms();
        await (view.fileItems[folder] as FolderTreeItem).setCollapsed(false);
        await (view.fileItems[`${folder}/sub`] as FolderTreeItem).setCollapsed(true);
        view.tree.selectItem(a);
        app.commands.executeCommandById('explorer-multi-select:invert-selection');
        await waitFor('the inversion', () => !view.tree.selectedDoms.has(a));
        const afterInvert = getSelectedPaths().filter((path) => path.startsWith(`${folder}/`));

        view.tree.clearSelectedDoms();
        const folderFile = app.vault.getFolderByPath(folder);
        if (folderFile) {
          await app.fileManager.trashFile(folderFile);
        }
        return { afterInvert, byFilter, isFilterCommandAvailableWithFilter, isFilterCommandAvailableWithoutFilter };

        function getSelectedPaths(): string[] {
          return [...view.tree.selectedDoms].map((item) => item.file.path).sort();
        }

        async function waitFor(step: string, isReady: () => boolean): Promise<void> {
          try {
            await waitUntil({ predicate: isReady, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
          } catch (error) {
            throw new Error(`Timed out waiting for ${step}.`, { cause: error });
          }
        }
      },
      input: { folder: FOLDER },
      vaultPath: getTemporaryVault().path
    });

    expect(result.isFilterCommandAvailableWithoutFilter).toBe(false);
    expect(result.isFilterCommandAvailableWithFilter).toBe(true);
    expect(result.byFilter).toEqual([`${FOLDER}/b.md`]);
    expect(result.afterInvert).toEqual([`${FOLDER}/b.md`, `${FOLDER}/c.canvas`, `${FOLDER}/sub`]);
  });
});
