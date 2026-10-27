import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';

import { prompt } from '@mnaoumov/obsidian-lib/modals/prompt';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ExplorerSelectionComponent } from '../selection-core/explorer-selection-component.ts';

import { FakeExplorerView } from '../test-helpers/fake-explorer-tree.test.helper.ts';
import { SelectByGlobPatternCommandHandler } from './select-by-glob-pattern-command-handler.ts';

vi.mock('@mnaoumov/obsidian-lib/modals/prompt', () => ({ prompt: vi.fn() }));

describe('SelectByGlobPatternCommandHandler', () => {
  it('selects the files and folders matching the pattern in the vault root', async () => {
    const view = new FakeExplorerView();
    const folder = view.tree.addFolder('draft-folder');
    const file = view.tree.addFile('draft.md');
    view.tree.addFile('final.md');
    const selectItems = vi.fn(() => [folder, file]);
    const showNotice = vi.fn();
    vi.mocked(prompt).mockImplementation((params) => {
      expect(params.title).toBe('Select by glob pattern in the vault root');
      expect(params.valueValidator?.('')).toBe('Enter a glob pattern.');
      return Promise.resolve('draft*');
    });
    const handler = new SelectByGlobPatternCommandHandler({
      app: App.createConfigured__().asOriginalType__(),
      explorerSelectionComponent: strictProxy<ExplorerSelectionComponent>({
        hasExplorer: () => true,
        revealExplorer: vi.fn(() => Promise.resolve(view.asView())),
        selectItems
      }),
      pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice })
    });
    const command = handler.buildCommand();
    expect(command.id).toBe('select-by-glob-pattern');
    expect(command.name).toBe('Select by glob pattern');

    command.checkCallback?.(false);

    await vi.waitFor(() => {
      expect(showNotice).toHaveBeenCalledWith('Selected 1 file, 1 folder.');
    });
    expect(selectItems).toHaveBeenCalledWith(view.asView(), [folder, file]);
  });
});
