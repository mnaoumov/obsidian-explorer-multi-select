# Open the selection

Core's context menu for several items offers Move, New folder with the items, Bookmark and Delete, but nothing that opens them. With two or more items selected, the plugin adds two items to that menu:

- **Open N files in new tabs**
  - opens every selected file in a tab of its own, in the order the File explorer shows them, and leaves the last one active.
- **Open N files in new window**
  - opens the first file in a new window and the rest as tabs of that window. Desktop only, since mobile has no windows.

Folders in the selection are skipped, so `N` counts the files only. Notes, canvases, bases and every other file type Obsidian opens go the same way.

The items are in core's menu, so they also show under **More actions** in [01 Selection mode](<./01 Selection mode.md>).

## Try it

The first button selects three notes and the **Fruit basket** folder in `Materials/01 Selection mode`.

```code-button
---
caption: Select three notes and a folder
---
await require('/demoSetup.ts').selectPaths(app, ['Materials/01 Selection mode/Apple.md', 'Materials/01 Selection mode/Banana.md', 'Materials/01 Selection mode/Cherry.md', 'Materials/01 Selection mode/Fruit basket']);
```

Manual equivalent: Alt-click (Option-click on macOS) [Apple](<./Materials/01 Selection mode/Apple.md>), [Banana](<./Materials/01 Selection mode/Banana.md>), [Cherry](<./Materials/01 Selection mode/Cherry.md>) and the **Fruit basket** folder.

```code-button
---
caption: Show the menu for the selection
---
await require('/demoSetup.ts').showSelectionMenu(app);
```

Manual equivalent: right-click one of the selected rows.

The menu offers **Open 3 files in new tabs** and, on desktop, **Open 3 files in new window**. The folder is not counted, and choosing either opens Apple, Banana and Cherry in that order.
