'use strict';

const { spawn } = require('child_process');

function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(b => b.type === 'text').map(b => b.text || '').join('\n');
  }
  return String(content);
}

function buildPrompt(body) {
  const messages = (body.messages || []).slice(-6); // last 6 turns only
  const systemText = extractText(body.system).slice(0, 300); // strip tool defs
  const turns = messages.map(m => {
    const role = m.role === 'assistant' ? 'Assistant' : 'User';
    return `${role}: ${extractText(m.content)}`;
  }).join('\n');
  return systemText ? `${systemText}\n\n${turns}` : turns;
}

const CODEX_BIN = process.platform === 'win32'
  ? 'C:\\Users\\giris\\AppData\\Roaming\\npm\\codex.cmd'
  : 'codex';

function run(prompt) {
  return new Promise((resolve, reject) => {
    // Pass prompt via stdin — avoids all shell splitting/escaping issues
    // Use cmd /c to invoke .cmd file without shell:true arg-injection warning
    const child = spawn('cmd', ['/d', '/c', CODEX_BIN, 'exec'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', code => {
      if (code !== 0 && !stdout) {
        return reject(new Error(`codex exited ${code}: ${stderr.trim().slice(0, 200)}`));
      }
      resolve(parseResponse(stdout));
    });

    child.on('error', reject);

    // Write prompt to stdin and close — codex reads it as additional input
    child.stdin.write(prompt.slice(0, 4000), 'utf8');
    child.stdin.end();

    setTimeout(() => { child.kill(); reject(new Error('codex timeout')); }, 30000);
  });
}

function parseResponse(raw) {
  const match = raw.match(/^codex\r?\n([\s\S]*?)^tokens used/m);
  if (match) return match[1].trim();
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  return lines[lines.length - 1] || raw.trim();
}

async function handleAnthropicRequest(body) {
  const prompt = buildPrompt(body);
  return wrapResponse(await run(prompt));
}

function wrapResponse(text) {
  return {
    id: `msg_codex_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: 'codex',
    stop_reason: 'end_turn',
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

module.exports = { run, handleAnthropicRequest };
