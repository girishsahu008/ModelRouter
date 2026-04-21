'use strict';

// Single entry point — starts both the Anthropic proxy (Claude Code) and OpenAI proxy (Codex)
require('./src/router-service');
require('./src/openai-adapter');
