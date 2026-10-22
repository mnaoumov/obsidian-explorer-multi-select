/**
 * @file
 *
 * The resets the selection-mode suites share. `resetExplorerState` runs after each test, so a test that fails half
 * way cannot leave a menu, a modal, the selection mode or a selection behind for the next one. Without it, one
 * failure on the phone cascaded: every later test tapped the open settings modal instead of a row, or long-pressed
 * into a selection mode that was already on. `resetDrawer` runs before a step that needs the phone's drawer open.
 *
 * Both functions are serialized into Obsidian, so neither may reach anything outside its own body: every constant
 * and helper they use is declared inside them.
 */

import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';
import type { CommonArguments } from 'obsidian-integration-testing';

/**
 * Closes the left sidebar and waits for its drawer to slide out.
 *
 * On a phone, the drawer can stay marked open while it is hidden after a menu or a modal, and expanding it then does
 * nothing. Closing it first resets that, so the next expand opens it. Desktop has no drawer, so there it does
 * nothing.
 *
 * @param params - The closure arguments.
 */
export async function resetDrawer({ app, lib: { waitUntil } }: CommonArguments): Promise<void> {
  const WAIT_TIMEOUT_IN_MILLISECONDS = 3000;
  // How long the phone's drawer takes to slide out.
  const DRAWER_ANIMATION_IN_MILLISECONDS = 1000;
  if (!app.isMobile) {
    return;
  }
  app.workspace.leftSplit.collapse();
  try {
    await waitUntil({ predicate: () => app.workspace.leftSplit.collapsed, timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
  } catch (error) {
    throw new Error('Timed out waiting for the sidebar to close.', { cause: error });
  }
  await sleep(DRAWER_ANIMATION_IN_MILLISECONDS);
}

/**
 * Closes every menu and modal, leaves the selection mode and clears the selection of every File explorer.
 *
 * @param params - The closure arguments.
 */
export async function resetExplorerState({ app, lib: { pressKey, waitUntil } }: CommonArguments): Promise<void> {
  const WAIT_TIMEOUT_IN_MILLISECONDS = 2000;
  // A modal can open a menu, and closing a menu can reveal a modal, so Escape is pressed until both are gone.
  const ESCAPE_ATTEMPTS = 3;
  const SELECTION_MODE_CLASS = 'explorer-multi-select-selection-mode';

  for (let attempt = 1; attempt <= ESCAPE_ATTEMPTS && hasOverlay(); attempt++) {
    await pressKey({ key: 'Escape' });
    try {
      await waitUntil({ predicate: () => !hasOverlay(), timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
    } catch {
      // Pressed again on the next attempt.
    }
  }
  if (hasOverlay()) {
    throw new Error('A menu or a modal is still open after the reset.');
  }

  const views = app.workspace.getLeavesOfType('file-explorer').map((leaf) => leaf.view as FileExplorerView);
  if (views.some((view) => view.containerEl.hasClass(SELECTION_MODE_CLASS))) {
    app.commands.executeCommandById('explorer-multi-select:toggle-selection-mode');
    try {
      await waitUntil({ predicate: () => views.every((view) => !view.containerEl.hasClass(SELECTION_MODE_CLASS)), timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS });
    } catch (error) {
      throw new Error('Timed out waiting for the selection mode to end in the reset.', { cause: error });
    }
  }
  for (const view of views) {
    view.tree.clearSelectedDoms();
  }

  function hasOverlay(): boolean {
    return document.querySelector('.menu, .modal-container') !== null;
  }
}
