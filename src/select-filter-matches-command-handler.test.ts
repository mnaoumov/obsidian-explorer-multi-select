import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';

import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ExplorerSelectionComponent } from './explorer-selection-component.ts';

import { SelectFilterMatchesCommandHandler } from './select-filter-matches-command-handler.ts';
import { FakeExplorerView } from './test-helpers/fake-explorer-tree.test.helper.ts';

describe('SelectFilterMatchesCommandHandler', () => {
  it('is available only while the explorer\'s filter is set, and selects the files it shows', async () => {
    let view: FakeExplorerView | null = null;
    const selectItems = vi.fn(() => []);
    const showNotice = vi.fn();
    const handler = new SelectFilterMatchesCommandHandler({
      app: App.createConfigured__().asOriginalType__(),
      explorerSelectionComponent: strictProxy<ExplorerSelectionComponent>({
        getExplorerView: () => view?.asView() ?? null,
        revealExplorer: vi.fn(() => Promise.resolve(view?.asView() ?? null)),
        selectItems
      }),
      pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice })
    });
    const command = handler.buildCommand();
    expect(command.id).toBe('select-filter-matches');
    expect(command.name).toBe('Select files matching the filter');

    expect(command.checkCallback?.(true)).toBe(false);
    view = new FakeExplorerView();
    expect(command.checkCallback?.(true)).toBe(false);

    const match = view.tree.addFile('match.md');
    view.tree.addFile('other.md', view.tree.root, { isFilteredOut: true });
    view.searchQuery = { matcher: {} };
    expect(command.checkCallback?.(true)).toBe(true);
    command.checkCallback?.(false);

    await vi.waitFor(() => {
      expect(showNotice).toHaveBeenCalledWith('Everything that matches is selected already.');
    });
    expect(selectItems).toHaveBeenCalledWith(view.asView(), [match]);
  });
});
