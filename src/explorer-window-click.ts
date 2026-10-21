import type { FileExplorerView } from '@obsidian-typings/obsidian-public-latest';
import type { Component } from 'obsidian';

import type { ExplorerTreeItem } from './explorer-tree-items.ts';

/**
 * Returns the element an event happened on. A mouse event's target is always an element, but Obsidian types
 * `targetNode` as any node.
 *
 * @param uiEvent - The event.
 * @returns The target element, or `null` when the target is not an element.
 */
export function getEventTargetElement(uiEvent: UIEvent): Element | null {
  const targetNode = uiEvent.targetNode;
  return targetNode?.instanceOf(Element) ? targetNode : null;
}

/**
 * Returns the explorer row an event happened on.
 *
 * @param view - The explorer.
 * @param uiEvent - The event.
 * @returns The row, or `null` when the event did not happen on one of this explorer's rows.
 */
export function getItemFromEvent(view: FileExplorerView, uiEvent: UIEvent): ExplorerTreeItem | null {
  // A row's `selfEl` sits in the row's own `el`, which is what the view maps to its file.
  const itemEl = getEventTargetElement(uiEvent)?.closest('.tree-item-self')?.parentElement;
  if (!itemEl || !view.tree.containerEl.contains(itemEl)) {
    return null;
  }
  const file = view.files.get(itemEl);
  return file ? view.fileItems[file.path] ?? null : null;
}

/**
 * Tells whether an event happened on a folder's arrow, which folds the folder.
 *
 * @param uiEvent - The event.
 * @returns Whether the event happened on the arrow.
 */
export function isOnCollapseIcon(uiEvent: UIEvent): boolean {
  return !!getEventTargetElement(uiEvent)?.closest('.collapse-icon');
}

/**
 * Listens for clicks in the capture phase of the explorer's window, which runs before every listener on its
 * document, and follows the explorer to a popout window. Other plugins take row clicks there: `Folder notes`
 * opens a folder's note from a capture listener on the document and stops the click, so a listener on the view
 * would never see a click on that folder.
 *
 * @param component - The component whose unload stops the listening.
 * @param view - The explorer.
 * @param listener - The listener.
 */
export function registerWindowCaptureClick(component: Component, view: FileExplorerView, listener: (mouseEvent: MouseEvent) => void): void {
  const options = { capture: true };
  let win = view.containerEl.win;
  win.addEventListener('click', listener, options);
  const offWindowMigrated = view.containerEl.onWindowMigrated((newWin) => {
    win.removeEventListener('click', listener, options);
    win = newWin;
    win.addEventListener('click', listener, options);
  });
  component.register(() => {
    offWindowMigrated();
    win.removeEventListener('click', listener, options);
  });
}
