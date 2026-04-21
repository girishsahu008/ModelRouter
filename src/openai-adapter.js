'use strict';

// Converts OpenAI chat/completions format ↔ internal format
// so Codex CLI can be proxied through the same router

const http = require('http');
const https = require('https');
const { classify } = require('./classifier');
const ollama = require('./connectors/ollama');
const gemini = require('./connectors/gemini');
const stats = require('./stats');

const PORT = parseInt(process.env.OPENAI_ROUTER_PORT || '8083', 10);
const OPENAI_API_HOST = 'api.openai.com';

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

function extractPromptFromOpenAI(body) {
  const messages = body.messages || [];
  const last = messages[messages.length - 1];
  if (!last) return '';
  return typeof last.content === 'string' ? last.content : '';
}

// Convert OpenAI messages → Anthropic-style for our connectors
function toAnthropicBody(openAIBody) {
  const system = (openAIBody.messages || []).find(m => m.role === 'system');
  const messages = (openAIBody.messages || []).filter(m => m.role !== 'system');
  return {
    messages,
    system: system ? system.content : undefined,
    max_tokens: openAIBody.max_tokens || 4096,
  };
}

// Convert Anthropic-style response → OpenAI chat completion format
function toOpenAIResponse(anthropicResp, model) {
  const text = anthropicResp.content?.[0]?.text || '';
  return {
    id: `chatcmpl_${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'router',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function forwardToOpenAI(req, rawBody, res) {
  const options = {
    hostname: OPENAI_API_HOST,
    port: 443,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: OPENAI_API_HOST },
  };

  const proxyReq = https.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error('[openai-adapter] OpenAI forward error:', err.message);
    sendJSON(res, 502, { error: { message: 'upstream error', type: 'proxy_error' } });
  });

  proxyReq.write(rawBody);
  proxyReq.end();
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url.includes('/v1/chat/completions')) {
    const rawBody = await readBody(req);
    forwardToOpenAI(req, rawBody, res);
    return;
  }

  const rawBody = await readBody(req);
  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return sendJSON(res, 400, { error: { message: 'invalid JSON', type: 'invalid_request_error' } });
  }

  const prompt = extractPromptFromOpenAI(body);
  const { target, rule } = classify(prompt);
  const anthropicBody = toAnthropicBody(body);
  const start = Date.now();

  try {
    let anthropicResp;

    if (target === 'gemma') {
      const available = await ollama.isAvailable();
      anthropicResp = available
        ? await ollama.handleAnthropicRequest(anthropicBody)
        : await gemini.handleAnthropicRequest(anthropicBody, 'gemini-flash');
    } else if (target === 'claude') {
      forwardToOpenAI(req, rawBody, res);
      return;
    } else {
      anthropicResp = await gemini.handleAnthropicRequest(anthropicBody, target);
    }

    const ms = Date.now() - start;
    stats.record(target, rule, ms);
    console.log(`[openai-adapter] ${rule} → ${target} (${ms}ms)`);
    sendJSON(res, 200, toOpenAIResponse(anthropicResp, body.model));

  } catch (err) {
    console.error('[openai-adapter] Error:', err.message);
    forwardToOpenAI(req, rawBody, res);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[openai-adapter] Listening on http://127.0.0.1:${PORT}`);
  console.log('[openai-adapter] Set OPENAI_BASE_URL=http://127.0.0.1:' + PORT + '/v1 for Codex');
});

module.exports = server;
