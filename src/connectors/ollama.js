'use strict';

const axios = require('axios');
const { spawn } = require('child_process');

const OLLAMA_BASE = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma3:1b';

let _autoStarted = false;

async function isAvailable() {
  try {
    await axios.get(`${OLLAMA_BASE}/api/tags`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function autoStart() {
  if (_autoStarted) return;
  _autoStarted = true;

  console.log('[ollama] Not running — attempting auto-start...');
  const child = spawn('ollama', ['serve'], {
    detached: true,
    stdio: 'ignore',
    shell: true,
    windowsHide: true,
  });
  child.unref();

  // Wait up to 8s for Ollama to come up
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await isAvailable()) {
      console.log('[ollama] Auto-started successfully');
      return;
    }
  }
  console.log('[ollama] Auto-start timed out — will fall back to next backend');
}

async function ensureRunning() {
  // Don't auto-start — Ollama runs as a system tray app on Windows
  // Auto-start was causing multiple instances and RAM exhaustion
  return isAvailable();
}

async function chat(messages, model = DEFAULT_MODEL) {
  const resp = await axios.post(`${OLLAMA_BASE}/api/chat`, {
    model,
    messages,
    stream: false,
    keep_alive: -1,
    options: {
      num_predict: 300,  // limit output tokens — faster responses
      temperature: 0.5,
    },
  }, { timeout: 35000 }).catch(err => {
    const detail = err.response?.data?.error || err.message;
    console.error(`[ollama] 400 detail: ${detail}`);
    console.error(`[ollama] messages sent: ${JSON.stringify(messages.map(m => ({ role: m.role, len: m.content?.length })))}`);
    throw new Error(`Ollama ${err.response?.status || 'error'}: ${detail}`);
  });

  return resp.data.message.content;
}

function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(b => b.type === 'text').map(b => b.text || '').join('\n');
  return String(content);
}

async function handleAnthropicRequest(body) {
  // Filter out tool_use / tool_result turns — Ollama only handles text
  const messages = (body.messages || [])
    .filter(m => {
      if (Array.isArray(m.content)) return m.content.some(b => b.type === 'text');
      return m.role === 'user' || m.role === 'assistant';
    })
    .map(m => ({ role: m.role, content: extractText(m.content).slice(0, 400) }))
    .filter(m => m.content.trim())
    .slice(-6); // keep last 6 messages only — local models can't handle long history

  if (body.system) {
    // Claude Code's system prompt is 20k+ chars (tool defs etc) — strip to first 400 chars
    const systemText = extractText(body.system).slice(0, 400);
    if (systemText.trim()) messages.unshift({ role: 'system', content: systemText });
  }

  const content = await chat(messages, DEFAULT_MODEL);

  return {
    id: `msg_ollama_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    model: DEFAULT_MODEL,
    stop_reason: 'end_turn',
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

module.exports = { chat, isAvailable, ensureRunning, handleAnthropicRequest };
