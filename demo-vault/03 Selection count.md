# Selection count

Core highlights the selected rows and says nothing else, so in a long or collapsed tree you cannot tell how much you are about to move or delete. The plugin shows the size of the selection in the status bar, counting files and folders apart, such as `3 files, 1 folder`. The count is empty when nothing is selected.

## Watch it change

```code-button
---
caption: Select two files and a folder
---
await require('/demoSetup.ts').selectPaths(app, ['Materials/01 Selection mode/Apple.md', 'Materials/01 Selection mode/Banana.md', 'Materials/01 Selection mode/Fruit basket']);
```

Manual equivalent: Alt-click (Option-click on macOS) **Apple**, **Banana** and **Fruit basket** in `Materials/01 Selection mode`.

The status bar now reads **2 files, 1 folder**. Alt-click one more row and the count follows. A selected folder counts once, however much is inside it.

On mobile, where Obsidian has no status bar, the action bar of [01 Selection mode](<./01 Selection mode.md>) shows the same count.

```code-button
---
caption: Clear the counted selection
---
await require('/demoSetup.ts').clearSelection(app);
```

Manual equivalent: click empty space in the File explorer.
