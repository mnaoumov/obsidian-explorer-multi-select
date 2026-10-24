import type { PopulateFilesParams } from 'obsidian-integration-testing';

import { CODE_SCRIPT_TOOLKIT_PLUGIN_ID } from '@mnaoumov/obsidian-dev-toolkit/demo-vault-buttons';
import { getRootFolder } from '@mnaoumov/typescript-dev-toolkit/root';
import { join } from 'node:path';
import process from 'node:process';
import { buildDemoVaultPopulateAsync } from 'obsidian-integration-testing';
import { createSetup } from 'obsidian-integration-testing/vitest-global-setup-plugin';

// `CodeScript Toolkit` is what turns a ```code-button fence into a button, and its root-relative
// `require('/demoSetup.ts')` into a call. In real use the in-vault `demo-vault-helper` installs it from
// The community registry on first launch — a GUI step, and `.obsidian/plugins/*` is gitignored, so the
// Installed copy exists only on a machine that did it, and goes stale there without anyone noticing.
const CODE_SCRIPT_TOOLKIT_SETTINGS = {
  invocableScriptsFolder: 'Invocables',
  modulesRoot: '_assets/CodeScriptToolkit',
  shouldHandleProtocolUrls: true,
  startupScriptPath: 'startup.ts'
};

// The ASYNC builder, not the synchronous `buildDemoVaultPopulate`: the sync one throws when the injected
// Plugin is missing or older than `minVersion`, while the async one downloads its release assets from the
// Repository Obsidian's community registry names. A warm checkout with an acceptable copy does no network I/O.
async function populate(): Promise<PopulateFilesParams> {
  return await buildDemoVaultPopulateAsync({
    demoVaultPath: join(getRootFolder() ?? process.cwd(), 'demo-vault'),
    injectPlugins: [{
      data: CODE_SCRIPT_TOOLKIT_SETTINGS,
      // The demo vault's scripts import `@mnaoumov/obsidian-lib` 6, which `CodeScript Toolkit` bundles only from 15.0.0
      // (13.8.0 to 14.x serve 3.3.1, whose names differ), so an older copy left installed in a warm checkout is
      // Re-downloaded rather than reused.
      minVersion: '15.0.0',
      pluginId: CODE_SCRIPT_TOOLKIT_PLUGIN_ID
    }]
  });
}

// Pre-populates the whole `demo-vault/` tree (plus the `CodeScript Toolkit` binary and its settings) before
// Obsidian opens, so the startup scan indexes every note in one pass. Used by
// `integration-tests:demo-vault`.
const { setup, teardown } = createSetup({
  enableCommunityPlugins: [CODE_SCRIPT_TOOLKIT_PLUGIN_ID],
  populate
});

export {
  setup,
  teardown
};
