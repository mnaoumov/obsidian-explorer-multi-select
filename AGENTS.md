# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

## Overview

`Explorer Multi-Select` fixes multi-select in Obsidian's core File explorer. Selecting several files and folders there is hard today, and on mobile it is impossible. The plugin works **inside the native pane**. It is not a replacement explorer: `Notebook Navigator`, `Column Explorer` and others already offer full selection in their own views, and users who want the core pane get nothing from them.

What core 1.14.4 already does, so the plugin never rebuilds it:

- **Mouse:** Alt/Option-click toggles an item and Shift-click adds a range. Ctrl/Cmd-click opens a new tab and clears the selection.
- **Clearing:** a plain click, a click on empty space, or opening another file clears the selection. Esc clears it too.
- **Keyboard:** Shift+Up/Down only grows the selection. Space opens the item, and Ctrl+A does nothing.
- **Actions on a selection:** the context menu offers Move, New folder with the items, Bookmark and Delete, and fires the public `files-menu` event. Drag moves the selection and updates links. Ctrl+C/X/V work.
- **Delete key:** asks once per file.
- **Mobile:** no multi-select at all.

## Current state

The repo was generated on 2026-10-17 with `create-obsidian-plugin` (preset `all-in-one`, CSS, desktop and mobile, the unofficial API subset, no editor extensions). Its answers are in `.create-obsidian-plugin.json`, so re-running the generator in this folder updates every file not edited by hand.

**Built: the selection core (design points 2 and 6).** `src/explorer-selection-component.ts` attaches to every File explorer tree. It adds Ctrl/Cmd+A, Space and a Shift+Up/Down range that shrinks when the direction reverses (`src/explorer-tree-keyboard.ts`), and it shows the selection's size in the status bar. `src/keyboard-selection.desktop.integration.test.ts` drives all of it with trusted key presses.

**Built: the touch selection mode (design point 1).** `src/explorer-selection-mode-component.ts` gives every explorer a header button, and the `Toggle selection mode` command turns it on too. While it is on, CSS draws a checkbox on each row from core's `is-selected` class, a plain tap toggles the row, and a bar under the tree shows the count with Move, Bookmark, Delete, More, Select all, Invert and Done. Done clears the selection. On mobile a long-press enters the mode with the row selected, behind the `shouldEnterSelectionModeOnLongPress` setting (on by default). `src/selection-mode.cross-platform.integration.test.ts` and `src/long-press-selection-mode.android.integration.test.ts` drive it with trusted taps on desktop and Android.

**Built: the click settings (design points 3 and 4).** `src/explorer-tree-click.ts` runs ahead of core's `handleItemSelection` on every explorer tree. With `shouldToggleSelectionOnCtrlOrCommandClick` on, a Ctrl/Cmd-click toggles the row the way core's Alt-click does, and opens nothing. With `shouldKeepSelectionOnClick` on, a plain click opens the file and keeps the selection. Both are off by default. `src/click-selection.desktop.integration.test.ts` turns them on through the settings tab and drives them with trusted clicks.

**Still the generator's samples:** the `Sample` and `Sample editor` commands in `src/plugin.ts`, and the whole demo vault. The coverage thresholds stay at 0 until those are replaced. Every other file under `src/` is at 100%, except `src/plugin-settings-tab.ts`, which has no unit test yet.

**Not released yet.** `main` is pushed to `mnaoumov/obsidian-explorer-multi-select`, but no version has been released. The plugin id `explorer-multi-select` was free in the community directory on 2026-10-17. An id can never change once it is published, so check it again right before the first submission.

## Design

This is the starting point the owner approved. Refine it as the build goes.

1. **Selection mode for touch, the biggest gap.** A toggle shows a checkbox on each row and an action bar: the count, Move, Delete, Bookmark, Select all, Invert and Done. A long-press enters it on mobile.
2. **Keyboard.** Ctrl/Cmd+A selects everything in the focused folder. Space toggles the focused item. Shift+Up/Down shrinks the range when the direction reverses.
3. **Ctrl/Cmd-click toggles the selection, as an opt-in setting** that is off by default, because core uses that click to open a new tab.
4. **Sticky selection.** An option keeps the selection when a plain click opens a file.
5. **Select by rule.** Commands select by extension, by glob pattern or by property value in the current folder. Invert, and "select the files matching the explorer's filter", go with them.
6. **Feedback.** The status bar shows a count such as "12 files, 3 folders".
7. **One confirmation for a batch delete,** routed through `FileManager` so the trash settings are respected.

**Out of scope:** move, delete and link updating, which core already does. The lasso is deferred, because demand for it is low and it clashes with native drag and with the tree's virtual scrolling.

## Internals

- The explorer's selection lives on `FileExplorerView.tree`, a `Tree`. It holds `selectedDoms`, `clearSelectedDoms`, `selectItem`, `deselectItem`, `handleItemSelection` and `onKeyArrowDown`, all declared in `obsidian-typings`.
- **One `Tree` class serves seven views:** the explorer, bookmarks, tags, outline, all properties, sync and the web viewer history. Patch only the explorer's tree instance, never the prototype unguarded.
- **Keys:** the explorer's tree registers its keys on `view.scope`, which is the same object as `tree.scope`. `Scope.handleKey` runs only the FIRST entry in `scope.keys` that matches, and core binds its listeners when it builds the tree. So patching `onKeyOpen` or `onKeyArrowDown` changes nothing, and a key registered with a plain `register` never runs for Space or Shift+Up/Down. The plugin moves its own entries to the front of `scope.keys`. When a key is not for it, such as a press in a text field, it calls the same core method that core bound.
- **Selection changes** go through `selectItem`, `deselectItem` and `clearSelectedDoms`, with one exception: `FileExplorerView.onDelete` deletes from `selectedDoms` directly. The status-bar count therefore also listens to the vault's `delete` event.
- **Clicks:** every row click goes through `tree.handleItemSelection(event, item)`, which returns `true` when the click only changed the selection, so the row's `onSelfClick` opens nothing. Alt and Shift return `true`. Any other mouse click clears the selection and the focused row, and returns `false`, so the row opens, in a new tab for Ctrl/Cmd or a middle-click. Enter goes through it too, with a key event, and opens. Opening a file then runs `FileExplorerView.onFileOpen`, which clears the selection again unless the opened row is `tree.focusedItem`. Core binds `onFileOpen` when the view opens, so a patch on it changes nothing. Sticky selection therefore skips the tree's `clearSelectedDoms` while core handles the click, and then focuses the clicked row.
- **Selection mode reuses core's actions.** Move runs core's own "Move N items to..." item, built through the public `files-menu` event and told apart by its icon `lucide-folder-tree`, because its title is translated. If the icon ever changes, Move falls back to core's menu. Bookmark runs the item the Bookmarks instance's `onFilesMenu` adds. Delete calls `FileExplorerView.onDeleteSelectedFiles`, which is core's Delete-key path, so it still asks once per file. More calls `openFileContextMenu` on a selected row, and core builds its multi-item menu for it.
- **Long-press on Obsidian Mobile fires two `contextmenu` events:** the native one while the finger is down, and an untrusted one Obsidian dispatches itself on `touchend`. The mode enters on the first one, then swallows `contextmenu` until the task after the gesture ends. Without that, the second event opens core's menu on top of the mode.
- **On a phone, any menu or modal closes the left drawer.** That includes More and core's long-press menu. `revealLeaf` alone does not reopen it after a menu, so the integration tests call `leftSplit.expand()` first. After the settings modal, the drawer can also stay marked open while it is hidden; collapsing it, waiting for the animation, then expanding it again resets it.
- **Integration tests:** `pressKey` only queues the key in Electron, so wait for its `keyup` before reading the state. It takes Electron key names: `Space`, `Up`, `Down` and `A`, not `' '` or `ArrowDown`. The tree renders only the rows in view, so call `tree.setFocusedItem(item, true)` and wait for the row to have a size before tapping it. Keep each `evalInObsidian` closure's declared waits under the transport's 30 s cap, which the lint rule `no-over-cap-wait-in-eval-in-obsidian` enforces, and split a longer flow across closures.
- `obsidian-typings` now declares `Tree.getSelectedItems`, `removeSelection`, `onKeyEscape`, `isKeyboardNavigationEvent`, `TreeItem.selectable`, `FileExplorerView.onFileContextMenu` and `itemsBeingCut`, and `handleItemSelection` now returns `boolean`. These are on its `1.14.4` release branches, but `@obsidian-typings/obsidian-public-1.14.4@1.12.0` does not have them yet. The selection core needs none of them. The click settings need `handleItemSelection`'s `boolean`, and cast the fallback to get it until that release, under a `TODO`. A later feature that needs the others must bump `obsidian-typings` first, and never declare them here.

## Conventions

- Gates: `npm run gate` runs format, spellcheck, markdown lint with link checks, build, lint, `find-overexposed` and unit-test coverage.
