import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type { PromptParams } from '@mnaoumov/obsidian-lib/modals/prompt';
import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';
import type { Mock } from 'vitest';

import { prompt } from '@mnaoumov/obsidian-lib/modals/prompt';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ExplorerSelectionComponent } from '../selection-core/explorer-selection-component.ts';
import type { ExplorerTreeItem } from '../selection-core/explorer-tree-items.ts';

import {
  FakeExplorerView,
  FakeScope
} from '../test-helpers/fake-explorer-tree.test.helper.ts';
import { SelectByExtensionCommandHandler } from './select-by-extension-command-handler.ts';

vi.mock('@mnaoumov/obsidian-lib/modals/prompt', () => ({ prompt: vi.fn() }));

describe('SelectByExtensionCommandHandler', () => {
  let hasExplorer: boolean;
  let promptAnswers: ((params: PromptParams) => null | string)[];
  let promptParams: PromptParams[];
  let selectItems: (view: FileExplorerView, items: readonly ExplorerTreeItem[]) => ExplorerTreeItem[];
  let showNotice: Mock;
  let view: FakeExplorerView | null;

  beforeEach(() => {
    hasExplorer = true;
    promptAnswers = [];
    promptParams = [];
    view = new FakeExplorerView();
    selectItems = vi.fn((explorerView: FileExplorerView, items: readonly ExplorerTreeItem[]) => items.filter((item) => !explorerView.tree.selectedDoms.has(item)));
    showNotice = vi.fn();
    vi.mocked(prompt).mockImplementation((params) => {
      promptParams.push(params);
      return Promise.resolve(promptAnswers.shift()?.(params) ?? null);
    });
  });

  function createHandler(): SelectByExtensionCommandHandler {
    return new SelectByExtensionCommandHandler({
      app: App.createConfigured__().asOriginalType__(),
      explorerSelectionComponent: strictProxy<ExplorerSelectionComponent>({
        hasExplorer: () => hasExplorer,
        revealExplorer: vi.fn(() => Promise.resolve(view?.asView() ?? null)),
        selectItems
      }),
      pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice })
    });
  }

  async function run(handler = createHandler()): Promise<void> {
    handler.buildCommand().checkCallback?.(false);
    await flushTasks();
  }

  function toggleIncludeSubfolders(params: PromptParams): void {
    const containerEl = createDiv();
    params.commandBuilder?.build({ containerEl, scope: new FakeScope().asScope() });
    const checkboxEl = containerEl.querySelector('input[type="checkbox"]');
    if (!(checkboxEl instanceof HTMLInputElement)) {
      throw new TypeError('No checkbox.');
    }
    checkboxEl.checked = !checkboxEl.checked;
    checkboxEl.dispatchEvent(new Event('change'));
  }

  it('is named, and unavailable without a File explorer', () => {
    const handler = createHandler();
    const command = handler.buildCommand();

    expect(command.id).toBe('select-by-extension');
    expect(command.name).toBe('Select by extension');
    expect(command.checkCallback?.(true)).toBe(true);
    hasExplorer = false;
    expect(command.checkCallback?.(true)).toBe(false);
  });

  it('selects the files with the extension in the focused folder and says how many', async () => {
    const tree = view?.tree ?? new FakeExplorerView().tree;
    const folder = tree.addFolder('folder');
    const inside = tree.addFile('inside.md', folder);
    const deeper = tree.addFolder('deeper', folder);
    tree.addFile('deep.md', deeper);
    tree.addFile('outside.md');
    tree.focusedItem = inside;
    promptAnswers.push((params) => {
      expect(params.title).toBe('Select files by extension in folder');
      expect(params.valueValidator?.(' ')).toBe('Enter at least one extension.');
      expect(params.valueValidator?.('md')).toBeUndefined();
      return 'md';
    });

    await run();

    expect(selectItems).toHaveBeenCalledWith(view?.asView(), [inside]);
    expect(showNotice).toHaveBeenCalledWith('Selected 1 file.');
  });

  it('looks inside subfolders when asked, and remembers the choice', async () => {
    const tree = view?.tree ?? new FakeExplorerView().tree;
    const folder = tree.addFolder('folder');
    const deep = tree.addFile('deep.md', folder);
    const top = tree.addFile('top.md');
    const handler = createHandler();
    promptAnswers.push((params) => {
      toggleIncludeSubfolders(params);
      return 'md';
    });
    await run(handler);
    expect(selectItems).toHaveBeenLastCalledWith(view?.asView(), [deep, top]);

    promptAnswers.push(() => 'md');
    await run(handler);
    expect(selectItems).toHaveBeenLastCalledWith(view?.asView(), [deep, top]);
  });

  it('says when nothing matches, or when every match is selected already', async () => {
    const tree = view?.tree ?? new FakeExplorerView().tree;
    const file = tree.addFile('a.md');
    promptAnswers.push(() => 'png');
    await run();
    expect(showNotice).toHaveBeenLastCalledWith('Nothing matches.');

    tree.selectItem(file);
    promptAnswers.push(() => 'md');
    await run();
    expect(showNotice).toHaveBeenLastCalledWith('Everything that matches is selected already.');
  });

  it('does nothing when the prompt is cancelled or there is no explorer to reveal', async () => {
    await run();
    expect(selectItems).not.toHaveBeenCalled();

    view = null;
    await run();
    expect(promptParams).toHaveLength(1);
    expect(showNotice).not.toHaveBeenCalled();
  });
});

async function flushTasks(): Promise<void> {
  for (let index = 0; index < 5; index++) {
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }
}
