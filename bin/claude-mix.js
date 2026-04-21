#!/usr/bin/env node
'use strict';

// claude-mix: starts Ollama + ModelRouter (if not running) then launches claude
// Regular `claude` command is completely unaffected.

const { spawn, spawnSync } = require('child_process');
const http = require('http');
const path = require('path');

const ROUTER_PORT = process.env.ROUTER_PORT || '8082';
const ROUTER_URL = `http://127.0.0.1:${ROUTER_PORT}`;
const OLLAMA_URL = 'http://127.0.0.1:11434';
const ROOT = path.join(__dirname, '..');

function isRouterRunning() {
  return new Promise(resolve => {
    http.get(`${ROUTER_URL}/health`, res => resolve(res.statusCode < 500))
      .on('error', () => resolve(false));
  });
}

function isOllamaRunning() {
  return new Promise(resolve => {
    http.get(`${OLLAMA_URL}/api/tags`, res => resolve(res.statusCode === 200))
      .on('error', () => resolve(false));
  });
}

async function warmupOllama(model) {
  const http2 = require('http');
  return new Promise(resolve => {
    const req = http2.request({
      hostname: '127.0.0.1', port: 11434,
      path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, res => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', resolve);
    req.write(JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], stream: false }));
    req.end();
  });
}

async function startOllama() {
  if (!(await isOllamaRunning())) {
    console.log('[claude-mix] Starting Ollama...');
    const child = spawn('ollama', ['serve'], {
      detached: true, stdio: 'ignore', shell: true, windowsHide: true,
    });
    child.unref();
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await isOllamaRunning()) break;
    }
  }

  // Warm up model so first real request is instant
  const model = process.env.OLLAMA_MODEL || 'phi4-mini:latest';
  console.log(`[claude-mix] Warming up ${model}...`);
  await warmupOllama(model);
  console.log(`[claude-mix] ${model} ready`);
}

async function startRouter() {
  console.log('[claude-mix] Starting ModelRouter...');
  const child = spawn(process.execPath, [path.join(ROOT, 'start.js')], {
    detached: true,
    stdio: 'ignore',
    cwd: ROOT,
  });
  child.unref();

  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isRouterRunning()) {
      console.log(`[claude-mix] Router ready on port ${ROUTER_PORT}`);
      return;
    }
  }
  console.log('[claude-mix] Router slow to start — continuing anyway');
}

const SYSTEM_INJECT = [
  'TOOL RULES (non-negotiable):',
  '- Use beads (bd) for ALL task tracking. NEVER use TodoWrite or markdown TODO lists.',
  '- Run `bd prime` at session start and after any context compaction to reload workflow context.',
  '- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md.',
  '- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files.',
].join('\n');

async function main() {
  const args = process.argv.slice(2);

  // Start Ollama and Router in parallel
  await Promise.all([
    startOllama(),
    isRouterRunning().then(up => up
      ? console.log(`[claude-mix] Router already running on port ${ROUTER_PORT}`)
      : startRouter()
    ),
  ]);

  // Inject beads+graphify reminder — survives context compaction
  const claudeArgs = ['--append-system-prompt', SYSTEM_INJECT, ...args];

  const result = spawnSync('claude', claudeArgs, {
    env: {
      ...process.env,
      ANTHROPIC_BASE_URL: ROUTER_URL,
      OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'gemma3:1b',
      OLLAMA_KEEP_ALIVE: '-1',
    },
    stdio: 'inherit',
    shell: true,
  });

  process.exit(result.status ?? 0);
}

main().catch(err => {
  console.error('[claude-mix] Fatal:', err.message);
  process.exit(1);
});
