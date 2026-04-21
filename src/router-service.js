'use strict';

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const { classify } = require('./classifier');
const ollama = require('./connectors/ollama');
const gemini = require('./connectors/gemini');
const codex = require('./connectors/codex');
const stats = require('./stats');

const PORT = parseInt(process.env.ROUTER_PORT || '8082', 10);
const ANTHROPIC_API_HOST = 'api.anthropic.com';

const TARGET_MAP = {
  gemma: 'ollama',
  'gemini-flash': 'gemini-flash',
  'gemini-pro': 'gemini-pro',
  'gemini-pro-high': 'gemini-pro-high',
  codex: 'codex',
  claude: 'passthrough',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, body) {
  const data = JSON.stringify(body);
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}

// Fallback chains — each target tries these backends in order until one succeeds
const FALLBACK_CHAINS = {
  gemma:           ['gemma', 'ollama', 'gemini-flash', 'passthrough'],
  codex:           ['codex', 'gemma', 'gemini-flash', 'passthrough'],
  'gemini-flash':  ['gemini-flash', 'gemma', 'gemini-pro', 'passthrough'],
  'gemini-pro':    ['gemini-pro', 'gemini-flash', 'gemma', 'passthrough'],
  claude:          ['passthrough'],
};

async function tryBackend(backend, body) {
  if (backend === 'passthrough') return null;

  if (backend === 'ollama') {
    const up = await ollama.ensureRunning();
    if (!up) throw new Error('Ollama unavailable');
    return ollama.handleAnthropicRequest(body);
  }

  if (backend === 'codex') {
    return codex.handleAnthropicRequest(body);
  }

  // gemma / gemini-flash / gemini-pro / gemini-pro-high — all go via Gemini API
  return gemini.handleAnthropicRequest(body, backend);
}

async function routeRequest(body) {
  const prompt = extractPrompt(body);
  const { target, rule } = classify(prompt);
  const chain = FALLBACK_CHAINS[target] || FALLBACK_CHAINS['gemini-flash'];

  const start = Date.now();

  for (const backend of chain) {
    if (backend === 'passthrough') return null;
    try {
      const response = await tryBackend(backend, body);
      const ms = Date.now() - start;
      const used = backend === TARGET_MAP[target] ? target : `${target}→${backend}`;
      stats.record(used, rule, ms);
      console.log(`[router] ${rule} → ${used} (${ms}ms)`);
      return appendRouterTag(response, backend, ms);
    } catch (err) {
      console.log(`[router] ${backend} failed (${err.message}) — trying next...`);
    }
  }

  // All backends failed — fall through to real Anthropic
  console.log('[router] All backends failed — passing through to Anthropic');
  return null;
}

function appendRouterTag(response, backend, ms) {
  if (!response?.content?.length) return response;
  const last = response.content[response.content.length - 1];
  if (last.type !== 'text') return response;

  const ollamaModel = process.env.OLLAMA_MODEL || 'gemma3:1b';
  const label = {
    'gemma':             `gemma-3-27b (Google)`,
    'ollama':            `${ollamaModel} (local)`,
    'codex':             `codex`,
    'gemini-flash':      `gemini-2.5-flash`,
    'gemini-pro':        `gemini-2.5-pro`,
    'gemini-flash-lite': `gemini-2.0-flash-lite`,
  }[backend] || backend;

  last.text += `\n\n\`[via: ${label} • ${(ms / 1000).toFixed(1)}s]\``;
  return response;
}

function extractPrompt(body) {
  if (!body.messages || !body.messages.length) return '';
  const last = body.messages[body.messages.length - 1];
  if (typeof last.content === 'string') return last.content;
  if (Array.isArray(last.content)) {
    return last.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  }
  return '';
}

function forwardToAnthropic(req, rawBody, res) {
  const options = {
    hostname: ANTHROPIC_API_HOST,
    port: 443,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: ANTHROPIC_API_HOST },
  };

  const proxyReq = https.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error('[router] Anthropic forward error:', err.message);
    sendJSON(res, 502, { error: 'upstream error' });
  });

  proxyReq.write(rawBody);
  proxyReq.end();
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    return sendJSON(res, 200, { status: 'ok', port: PORT });
  }

  if (req.method !== 'POST' || !req.url.includes('/v1/messages')) {
    // non-messages endpoint — just proxy through
    const rawBody = await readBody(req);
    forwardToAnthropic(req, rawBody, res);
    return;
  }

  let rawBody;
  try {
    rawBody = await readBody(req);
  } catch (e) {
    return sendJSON(res, 400, { error: 'bad request' });
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return sendJSON(res, 400, { error: 'invalid JSON' });
  }

  try {
    const response = await routeRequest(body);
    if (response === null) {
      forwardToAnthropic(req, rawBody, res);
    } else {
      sendJSON(res, 200, response);
    }
  } catch (err) {
    console.error('[router] Error:', err.message);
    // on error, fall back to real Anthropic
    forwardToAnthropic(req, rawBody, res);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[claude-router] Listening on http://127.0.0.1:${PORT}`);
  console.log('[claude-router] Set ANTHROPIC_BASE_URL=http://127.0.0.1:' + PORT + ' in your environment');
});

module.exports = server;
