import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ExplorerSelectionComponent } from './explorer-selection-component.ts';

import { ToggleSelectionModeCommandHandler } from './toggle-selection-mode-command-handler.ts';

interface HandlerFixture {
  readonly handler: ToggleSelectionModeCommandHandler;
  readonly toggleSelectionMode: () => Promise<void>;
}

describe('ToggleSelectionModeCommandHandler', () => {
  function createHandler(hasExplorer: boolean): HandlerFixture {
    const toggleSelectionMode = vi.fn(noopAsync);
    const explorerSelectionComponent = strictProxy<ExplorerSelectionComponent>({
      hasExplorer: () => hasExplorer,
      toggleSelectionMode
    });
    return { handler: new ToggleSelectionModeCommandHandler({ explorerSelectionComponent }), toggleSelectionMode };
  }

  it('is named and toggles the explorer\'s selection mode', async () => {
    const { handler, toggleSelectionMode } = createHandler(true);
    const command = handler.buildCommand();

    expect(command.id).toBe('toggle-selection-mode');
    expect(command.name).toBe('Toggle selection mode');
    expect(command.checkCallback?.(true)).toBe(true);
    command.checkCallback?.(false);
    await vi.waitFor(() => {
      expect(toggleSelectionMode).toHaveBeenCalledOnce();
    });
  });

  it('is unavailable without a File explorer', () => {
    const { handler, toggleSelectionMode } = createHandler(false);

    expect(handler.buildCommand().checkCallback?.(true)).toBe(false);
    expect(toggleSelectionMode).not.toHaveBeenCalled();
  });
});
