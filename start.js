'use strict';

// Load .env if present (for local dev — never commit .env)
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// Single entry point — starts both the Anthropic proxy (Claude Code) and OpenAI proxy (Codex)
require('./src/router-service');
require('./src/openai-adapter');
