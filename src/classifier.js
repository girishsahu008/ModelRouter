'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const RULES_PATH = path.join(__dirname, '..', 'config', 'routing-rules.yaml');

function loadRules() {
  if (!fs.existsSync(RULES_PATH)) return getDefaultRules();
  return yaml.load(fs.readFileSync(RULES_PATH, 'utf8')).rules;
}

function getDefaultRules() {
  return [
    {
      name: 'Trivial',
      target: 'gemma',
      conditions: {
        patterns: ['syntax error', 'typo', 'fix typo', 'rename', 'format', 'indent', 'missing comma', 'missing semicolon', 'trailing space', 'spelling'],
        max_length: 300,
      },
      exclude_patterns: ['architect', 'design', 'implement', 'refactor'],
    },
    {
      name: 'Read & Explain',
      target: 'gemma',
      conditions: {
        patterns: ['read', 'read the file', 'show me', 'what is in', 'open the file', 'look at', 'explain this', 'explain the', 'what does this do', 'what is this', 'summarize', 'describe', 'list the', 'show the', 'print the', 'what are the', 'how many', 'find the', 'search for', 'grep', 'ls', 'dir'],
      },
      exclude_patterns: ['architect', 'design', 'implement', 'refactor entire', 'microservice'],
    },
    {
      name: 'Basic Questions',
      target: 'gemma',
      conditions: {
        patterns: ['what is', "what's", 'how do i', 'how does', 'can you', 'tell me', 'who are', 'which model', 'what model', 'what day', 'what time', 'what version', 'where is', 'show me how', 'give me', 'help me understand'],
        max_length: 500,
      },
      exclude_patterns: ['architect', 'implement', 'design system', 'microservice', 'security'],
    },
    {
      name: 'Testing',
      target: 'codex',
      conditions: {
        patterns: ['write test', 'unit test', 'integration test', 'test suite', 'mock', 'stub', 'debug', 'trace', 'stack trace', 'error message', 'why does', 'what does this error'],
      },
    },
    {
      name: 'Features',
      target: 'gemini-pro',
      conditions: {
        patterns: ['implement', 'create', 'add feature', 'build', 'component', 'endpoint', 'api', 'function', 'class', 'module', 'hook', 'middleware'],
        max_length: 2000,
      },
      exclude_patterns: ['microservice', 'distributed', 'scalable', 'architect', 'system design'],
    },
    {
      name: 'Complex',
      target: 'claude',
      conditions: {
        patterns: ['architect', 'design system', 'microservice', 'distributed', 'scalable', 'security audit', 'performance optimization', 'refactor entire', 'system design', 'trade-off', 'technical decision'],
      },
    },
  ];
}

function extractInlineOverride(prompt) {
  const match = prompt.match(/\[use:(\w[\w-]*)\]/i);
  return match ? match[1].toLowerCase() : null;
}

function matchesPatterns(prompt, patterns) {
  const lower = prompt.toLowerCase();
  return patterns.some(p => lower.includes(p.toLowerCase()));
}

function classify(prompt) {
  const override = extractInlineOverride(prompt);
  if (override) return { target: override, rule: 'inline-override', override: true };

  const rules = loadRules();
  const len = prompt.length;

  for (const rule of rules) {
    const cond = rule.conditions || {};
    let matches = false;

    if (cond.patterns && matchesPatterns(prompt, cond.patterns)) matches = true;
    if (cond.max_length && len <= cond.max_length && !cond.patterns) matches = true;
    if (cond.min_length && len >= cond.min_length) matches = true;

    if (!matches) continue;

    if (rule.exclude_patterns && matchesPatterns(prompt, rule.exclude_patterns)) continue;
    if (cond.max_length && len > cond.max_length) continue;

    return { target: rule.target, rule: rule.name, override: false };
  }

  return { target: 'gemma', rule: 'default', override: false };
}

module.exports = { classify, loadRules };
