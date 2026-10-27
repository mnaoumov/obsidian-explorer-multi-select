import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type {
  CachedMetadata,
  TFile
} from 'obsidian';
import type { Mock } from 'vitest';

import { prompt } from '@mnaoumov/obsidian-lib/modals/prompt';
import { selectItem } from '@mnaoumov/obsidian-lib/modals/select-item';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
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

import { FakeExplorerView } from '../test-helpers/fake-explorer-tree.test.helper.ts';
import { SelectByPropertyValueCommandHandler } from './select-by-property-value-command-handler.ts';

vi.mock('@mnaoumov/obsidian-lib/modals/prompt', () => ({ prompt: vi.fn() }));
vi.mock('@mnaoumov/obsidian-lib/modals/select-item', () => ({ selectItem: vi.fn() }));

describe('SelectByPropertyValueCommandHandler', () => {
  let selectItems: (view: unknown, items: readonly ExplorerTreeItem[]) => ExplorerTreeItem[];
  let showNotice: Mock;
  let view: FakeExplorerView;

  beforeEach(() => {
    selectItems = vi.fn((_view: unknown, items: readonly ExplorerTreeItem[]) => [...items]);
    showNotice = vi.fn();
    view = new FakeExplorerView();
  });

  function createHandler(): SelectByPropertyValueCommandHandler {
    const app = App.createConfigured__().asOriginalType__();
    const caches: Record<string, CachedMetadata> = {
      'done.md': { frontmatter: { status: 'done' } },
      'open.md': { frontmatter: { status: 'open' } }
    };
    app.metadataCache.getAllPropertyInfos = (): ReturnType<typeof app.metadataCache.getAllPropertyInfos> => ({
      aliases: { name: 'aliases', occurrences: 1, widget: 'aliases' },
      status: { name: 'status', occurrences: 2, widget: 'text' }
    });
    app.metadataCache.getFileCache = (file: TFile): CachedMetadata | null => caches[file.path] ?? null;
    return new SelectByPropertyValueCommandHandler({
      app,
      explorerSelectionComponent: strictProxy<ExplorerSelectionComponent>({
        hasExplorer: () => true,
        revealExplorer: vi.fn(() => Promise.resolve(view.asView())),
        selectItems
      }),
      pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice })
    });
  }

  it('asks for a property, then a value, and selects the notes that have it', async () => {
    const done = view.tree.addFile('done.md');
    view.tree.addFile('open.md');
    view.tree.addFile('none.md');
    vi.mocked(selectItem).mockImplementation((params) => {
      expect(params.items).toEqual(['aliases', 'status']);
      expect(params.itemTextFunction('status')).toBe('status');
      return Promise.resolve('status');
    });
    vi.mocked(prompt).mockImplementation((params) => {
      expect(params.title).toBe('Select notes whose status is in the vault root');
      expect(params.valueValidator?.('')).toBeUndefined();
      return Promise.resolve('Done');
    });
    const command = createHandler().buildCommand();
    expect(command.id).toBe('select-by-property-value');
    expect(command.name).toBe('Select by property value');

    command.checkCallback?.(false);

    await vi.waitFor(() => {
      expect(selectItems).toHaveBeenCalledWith(view.asView(), [done]);
    });
  });

  it('stops when no property is picked', async () => {
    vi.mocked(selectItem).mockResolvedValue(null);
    vi.mocked(prompt).mockClear();

    createHandler().buildCommand().checkCallback?.(false);

    await vi.waitFor(() => {
      expect(selectItem).toHaveBeenCalled();
    });
    await noopAsync();
    expect(prompt).not.toHaveBeenCalled();
    expect(selectItems).not.toHaveBeenCalled();
  });
});
