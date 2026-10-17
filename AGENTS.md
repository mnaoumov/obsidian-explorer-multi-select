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

**Scaffolded, nothing built yet.** The repo was generated on 2026-10-17 with `create-obsidian-plugin` (preset `all-in-one`, CSS, desktop and mobile, the unofficial API subset, no editor extensions). Its answers are in `.create-obsidian-plugin.json`, so re-running the generator in this folder updates every file not edited by hand. Everything under `src/` is still the generator's sample code, and the demo vault is still its sample vault. The coverage thresholds stay at 0 until real code replaces the samples.

**No GitHub remote exists yet.** `mnaoumov/obsidian-explorer-multi-select` has not been created, so nothing is pushed and nothing is released. The plugin id `explorer-multi-select` was free in the community directory on 2026-10-17. An id can never change once it is published, so check it again right before the first submission.

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
- Several runtime members are missing from the typings: `onKeyEscape`, `getSelectedItems`, `removeSelection`, `TreeItem.selectable`, `onFileContextMenu`, and copy and cut. Add them to `obsidian-typings` rather than declaring them here, and verify each against a live build before relying on it.

## Conventions

- Gates: `npm run gate` runs format, spellcheck, markdown lint with link checks, build, lint, `find-overexposed` and unit-test coverage.
