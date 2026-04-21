'use strict';

const axios = require('axios');

const GEMINI_API_KEY = process.env.GOOGLE_API_KEY;
if (!GEMINI_API_KEY) throw new Error('GOOGLE_API_KEY environment variable is required');
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Confirmed available on this key
const MODEL_MAP = {
  'gemma':             'gemma-3-27b-it',      // free, fast, replaces local Ollama
  'gemini-flash':      'gemini-2.5-flash',
  'gemini-pro':        'gemini-2.5-pro',
  'gemini-flash-lite': 'gemini-2.0-flash-lite',
};

// Extract plain text from Anthropic content (string | array of blocks)
function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b.type === 'text')
      .map(b => b.text || '')
      .join('\n');
  }
  return String(content);
}

// Extract plain text from Anthropic system prompt (string | array of blocks)
function extractSystem(system) {
  if (!system) return '';
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system.filter(b => b.type === 'text').map(b => b.text || '').join('\n');
  }
  return String(system);
}

async function chat(messages, modelAlias = 'gemini-flash') {
  const model = MODEL_MAP[modelAlias] || MODEL_MAP['gemini-flash'];
  const url = `${BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const systemMsg = messages.find(m => m.role === 'system');
  // Truncate system prompt — Claude Code sends 20k+ chars of tool defs we don't need
  const systemText = systemMsg ? extractSystem(systemMsg.content).slice(0, 500) : null;

  // Gemini requires alternating user/model turns — collapse consecutive same-role messages
  // Keep last 8 messages only to avoid burning free quota on long history
  const turns = [];
  for (const m of messages.filter(m => m.role !== 'system').slice(-8)) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const text = extractText(m.content);
    if (!text.trim()) continue;
    if (turns.length && turns[turns.length - 1].role === role) {
      turns[turns.length - 1].parts[0].text += '\n' + text;
    } else {
      turns.push({ role, parts: [{ text }] });
    }
  }

  // Gemini requires first message to be from user
  if (!turns.length || turns[0].role !== 'user') {
    turns.unshift({ role: 'user', parts: [{ text: '.' }] });
  }

  // gemma-3-27b-it does not support system_instruction
  const supportsSystem = !model.startsWith('gemma');
  const payload = {
    contents: turns,
    ...(systemText && supportsSystem && { system_instruction: { parts: [{ text: systemText }] } }),
    generationConfig: { maxOutputTokens: 8192 },
  };

  const resp = await axios.post(url, payload, { timeout: 30000 }).catch(err => {
    const status = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;
    if (status === 429) throw new Error(`Rate limited (429): ${msg}`);
    if (status === 400) throw new Error(`Bad request (400): ${msg}`);
    throw err;
  });
  return resp.data.candidates[0].content.parts[0].text;
}

async function handleAnthropicRequest(body, modelAlias = 'gemini-flash') {
  const messages = body.messages || [];
  const withSystem = body.system
    ? [{ role: 'system', content: body.system }, ...messages]
    : messages;

  const content = await chat(withSystem, modelAlias);

  return {
    id: `msg_gemini_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    model: modelAlias,
    stop_reason: 'end_turn',
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

module.exports = { chat, handleAnthropicRequest };
