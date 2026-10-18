# Keyboard

Core's File explorer can grow a selection with Shift+Up/Down, but it cannot select everything, cannot toggle one row, and never shrinks a range once it has grown. This plugin adds the three keys, so a keyboard user can build any selection without the mouse.

- **`Ctrl+A` / `Cmd+A`**
  - selects every row in the focused row's folder. Pressed again, when that adds nothing, it selects every row the File explorer shows.
- **`Space`**
  - adds the focused row to the selection, or takes it out, where core would open it. `Enter` still opens it.
- **`Shift+Up` / `Shift+Down`**
  - grows the selection from where it started, and shrinks it again when you reverse direction.

## Try it

The keys act on the File explorer only while it has the keyboard focus. Press the button, then press keys straight away, without clicking anywhere else.

```code-button
---
caption: Focus Apple in the File explorer
---
await require('/demoSetup.ts').focusRow(app, 'Materials/01 Selection mode/Apple.md');
```

Manual equivalent: click **Apple** in `Materials/01 Selection mode`, then press `Esc` to clear the selection the click made.

Now try, in order:

1. Press `Shift+Down` twice. **Apple**, **Banana** and **Cherry** are selected.
2. Press `Shift+Up` once. The range shrinks back to **Apple** and **Banana**. Core would have kept all three.
3. Press `Space`. **Banana**, which has the focus, leaves the selection, and **Apple** stays. Press it again and **Banana** is back.
4. Press `Ctrl+A` / `Cmd+A`. Everything in the folder is selected, the **Fruit basket** folder included.

```code-button
---
caption: Clear the keyboard selection
---
await require('/demoSetup.ts').clearSelection(app);
```

Manual equivalent: press `Esc` in the File explorer.
