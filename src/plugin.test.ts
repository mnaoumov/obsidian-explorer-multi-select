import type {
  App as AppOriginal,
  PluginManifest
} from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { Plugin as ObsidianPlugin } from 'obsidian';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { ExplorerSelectionComponent } from './explorer-selection-component.ts';
import { PluginSettings } from './plugin-settings.ts';
import { Plugin } from './plugin.ts';

interface AppGlobal {
  app: AppOriginal;
}

interface ExplorerSelectionComponentInternals {
  getSettings: () => PluginSettings;
}

const manifest = castTo<PluginManifest>({
  author: 'test',
  description: 'test',
  id: 'explorer-multi-select',
  minAppVersion: '1.0.0',
  name: 'Explorer Multi-Select',
  version: '1.0.0'
});

let app: AppOriginal;

describe('Plugin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    app = App.createConfigured__().asOriginalType__();
    // Expose the app as the global instance so library helpers that resolve the app without an explicit argument read this one.
    castTo<AppGlobal>(window).app = app;
  });

  it('extends the Obsidian Plugin class', () => {
    expect(Plugin.prototype).toBeInstanceOf(ObsidianPlugin);
  });

  it('registers the selection commands and the open demo vault command', async () => {
    const plugin = new Plugin(app, manifest);
    const addCommandSpy = vi.spyOn(plugin, 'addCommand');
    await plugin.onload();
    for (
      const id of [
        'toggle-selection-mode',
        'select-by-extension',
        'select-by-glob-pattern',
        'select-by-property-value',
        'select-filter-matches',
        'invert-selection',
        'open-demo-vault'
      ]
    ) {
      expect(addCommandSpy).toHaveBeenCalledWith(expect.objectContaining({ id }));
    }
  });

  it('adds the selection count to the status bar', async () => {
    const plugin = new Plugin(app, manifest);
    const addStatusBarItemSpy = vi.spyOn(plugin, 'addStatusBarItem');
    await plugin.onload();
    expect(addStatusBarItemSpy).toHaveBeenCalledTimes(1);
  });

  it('gives the explorer component the loaded settings', async () => {
    const plugin = new Plugin(app, manifest);
    const addChildSpy = vi.spyOn(plugin, 'addChild');
    await plugin.onload();
    const explorerSelectionComponent = addChildSpy.mock.results.map((result) => result.value as unknown).find((child) => child instanceof ExplorerSelectionComponent);
    expect(castTo<ExplorerSelectionComponentInternals>(explorerSelectionComponent).getSettings()).toStrictEqual(new PluginSettings());
  });
});
