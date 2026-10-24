# CHANGELOG

## 1.1.0

- test(demo-vault): self-heal a missing or stale `CodeScript Toolkit` in the demo-vault suite
- test(demo-vault): floor `CodeScript Toolkit` at 15.0.0
- test: drop the longPressRow retry on obsidian-integration-testing 17.5.1
- test: wait for the bookmark modal's Save button to settle on Android
- test: harden the Android selection-mode suites against flakes and cascades
- chore(deps): move to @mnaoumov/obsidian-lib 6 and @mnaoumov/obsidian-dev-toolkit 5
- docs: shorten the debugging section
- chore: replace leftover obsidian-dev-utils references with @mnaoumov/obsidian-lib
- docs(readme): lead the Debugging section with `Advanced Debug Mode`
- feat: clear the File explorer selection with Shift+Space
- fix: toggle folders on Ctrl/Cmd-click when `Folder notes` takes their clicks
- feat: add a Clear selection button to the selection mode's action bar
- fix: toggle folders in selection mode when `Folder notes` takes their clicks
- docs: link the community directory listing from the installation section
- docs: link the changelog from the README and record the 1.0.0 release

## 1.0.0

- test(integration): run the desktop and Android suites in the release preflight
- docs: add the desktop and mobile screenshots, captured from the demo vault
- build(deps): bump @mnaoumov/obsidian-dev-toolkit to ^3.6.0
- docs: document every `Explorer Multi-Select` feature in the demo vault and README
- feat: delete a multi-item selection in the File explorer with one confirmation
- feat: add select-by-rule commands to the File explorer
- feat: add Ctrl/Cmd-click toggling and sticky selection to the File explorer
- feat: add a touch selection mode to the File explorer
- feat: add keyboard selection and a status-bar count to the File explorer
- ci: pin Node 26 in .nvmrc
- fix(demo-vault): stop linking to the gitignored scratch note
- docs: record the approved design in AGENTS.md
- chore: scaffold `Explorer Multi-Select` with create-obsidian-plugin
