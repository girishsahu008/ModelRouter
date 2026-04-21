#!/usr/bin/env node
'use strict';

// Wrapper: sets ANTHROPIC_BASE_URL to point at the local router, then launches claude
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
let forceModel = null;
let dryRun = false;

const filtered = args.filter(a => {
  if (a.startsWith('--force-model=')) { forceModel = a.split('=')[1]; return false; }
  if (a === '--dry-run') { dryRun = true; return false; }
  return true;
});

const env = { ...process.env, ANTHROPIC_BASE_URL: 'http://127.0.0.1:8082' };
if (forceModel) env.ROUTER_FORCE_MODEL = forceModel;
if (dryRun) env.ROUTER_DRY_RUN = '1';

if (dryRun) {
  console.log('[claude-routed] DRY RUN — would connect to http://127.0.0.1:8082');
  console.log('[claude-routed] Args:', filtered);
  process.exit(0);
}

const result = spawnSync('claude', filtered, { env, stdio: 'inherit', shell: true });
process.exit(result.status ?? 0);
