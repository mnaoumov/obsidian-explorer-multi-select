import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';

import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ExplorerSelectionComponent } from './explorer-selection-component.ts';

import { InvertSelectionCommandHandler } from './invert-selection-command-handler.ts';
import { FakeExplorerView } from './test-helpers/fake-explorer-tree.test.helper.ts';

interface HandlerFixture {
  readonly handler: InvertSelectionCommandHandler;
  readonly invertSelection: (view: FileExplorerView) => void;
}

describe('InvertSelectionCommandHandler', () => {
  function createHandler(view: FileExplorerView | null, hasExplorer = true): HandlerFixture {
    const invertSelection = vi.fn();
    const explorerSelectionComponent = strictProxy<ExplorerSelectionComponent>({
      hasExplorer: () => hasExplorer,
      invertSelection,
      revealExplorer: vi.fn(() => Promise.resolve(view))
    });
    return { handler: new InvertSelectionCommandHandler({ explorerSelectionComponent }), invertSelection };
  }

  it('is named and inverts the explorer\'s selection', async () => {
    const view = new FakeExplorerView().asView();
    const { handler, invertSelection } = createHandler(view);
    const command = handler.buildCommand();

    expect(command.id).toBe('invert-selection');
    expect(command.name).toBe('Invert selection');
    expect(command.checkCallback?.(true)).toBe(true);
    command.checkCallback?.(false);
    await vi.waitFor(() => {
      expect(invertSelection).toHaveBeenCalledWith(view);
    });
  });

  it('is unavailable without a File explorer, and inverts nothing when none can be revealed', async () => {
    expect(createHandler(null, false).handler.buildCommand().checkCallback?.(true)).toBe(false);

    const { handler, invertSelection } = createHandler(null);
    handler.buildCommand().checkCallback?.(false);
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
    expect(invertSelection).not.toHaveBeenCalled();
  });
});
