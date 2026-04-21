'use strict';

const fs = require('fs');
const path = require('path');

const STATS_FILE = path.join(require('os').homedir(), '.claude-router', 'usage-stats.json');

function load() {
  if (!fs.existsSync(STATS_FILE)) return { requests: [] };
  try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch { return { requests: [] }; }
}

function save(data) {
  const dir = path.dirname(STATS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
}

function record(target, rule, durationMs) {
  const data = load();
  data.requests.push({ target, rule, durationMs, ts: Date.now() });
  if (data.requests.length > 10000) data.requests = data.requests.slice(-10000);
  save(data);
}

function summary(sinceMs = 0) {
  const { requests } = load();
  const cutoff = Date.now() - sinceMs;
  const filtered = sinceMs ? requests.filter(r => r.ts >= cutoff) : requests;

  const counts = {};
  for (const r of filtered) {
    counts[r.target] = (counts[r.target] || 0) + 1;
  }
  return { total: filtered.length, byTarget: counts };
}

module.exports = { record, summary };
