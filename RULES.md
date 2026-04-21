# ModelRouter Routing Rules

## Purpose

These rules govern how Claude Code requests are classified and routed to the appropriate AI backend. Rules are evaluated top-to-bottom; first match wins. Unmatched requests fall to the default provider (gemini-flash).

---

## Rule Priority Order

```
1. TRIVIAL  → gemma4:26b (local Ollama, instant, free)
2. TESTING  → gemini-flash (free API, fast)
3. FEATURES → gemini-pro (free API, capable)
4. COMPLEX  → claude-pro (subscription, reserved for hard problems)
5. DEFAULT  → gemini-flash
```

---

## Rule Definitions

### TRIVIAL — Route to: `gemma` (local Ollama)

Conditions (ANY match):
- Prompt contains: `syntax error`, `typo`, `fix typo`, `rename`, `format`, `indent`, `missing comma`, `missing semicolon`, `trailing space`, `spelling`
- Prompt length ≤ 300 characters
- File extension: `.md`, `.txt`, `.yaml`, `.yml`, `.json` (simple edits only)

Excludes:
- Prompts mentioning `architecture`, `design`, `implement`, `refactor`

### TESTING — Route to: `gemini-flash`

Conditions (ANY match):
- Prompt contains: `write test`, `unit test`, `integration test`, `test suite`, `mock`, `stub`, `debug`, `trace`, `breakpoint`, `stack trace`, `error message`, `why does`, `what does this error`
- Prompt length 300–800 characters

### FEATURES — Route to: `gemini-pro`

Conditions (ANY match):
- Prompt contains: `implement`, `create`, `add feature`, `build`, `component`, `endpoint`, `api`, `function`, `class`, `module`, `hook`, `middleware`
- Prompt length 400–2000 characters

Excludes:
- Prompts mentioning `microservice`, `distributed`, `scalable`, `architect`, `system design`

### COMPLEX — Route to: `claude-pro`

Conditions (ANY match):
- Prompt contains: `architect`, `design system`, `microservice`, `distributed`, `scalable`, `security audit`, `performance optimization`, `refactor entire`, `system design`, `trade-off`, `technical decision`
- Prompt length ≥ 800 characters AND contains `design` or `architect`
- Explicit override: `[use:claude]` anywhere in prompt

---

## Inline Overrides

Users can force a specific model by prefixing the prompt:

```
[use:gemma]   → Force local Ollama (gemma4:26b)
[use:gemini]  → Force Gemini Flash
[use:claude]  → Force Claude Pro
[use:auto]    → Reset to automatic routing
```

---

## Per-Project Overrides

Create `.claude-router.yaml` in your project root:

```yaml
extends: ~/.claude-router/routing-rules.yaml
rules:
  - name: "React Components"
    target: gemini-flash
    conditions:
      patterns: ["component", "jsx", "tsx"]
      file_patterns: ["*.tsx", "*.jsx"]
```

---

## Decision Flow

```
Request received
  ↓
Strip [use:X] override → if present, route directly
  ↓
Check TRIVIAL rules → match? → gemma (local)
  ↓
Check TESTING rules → match? → gemini-flash
  ↓
Check FEATURES rules → match? → gemini-pro
  ↓
Check COMPLEX rules → match? → claude-pro
  ↓
Default → gemini-flash
```

---

## Model Capabilities Reference

| Model | Speed | Cost | Best For |
|-------|-------|------|----------|
| gemma4:26b (local) | ~0.8s | Free | Syntax, formatting, simple edits |
| gemini-flash | ~1.5s | Free tier | Tests, debugging, quick tasks |
| gemini-pro | ~2s | Free tier | Features, moderate complexity |
| claude-pro | ~3-5s | Subscription | Architecture, complex reasoning |

---

## Routing Statistics Goal

Target: ≤ 15% of requests reach Claude Pro.

```
gemma (local):   ~35% of requests
gemini-flash:    ~30% of requests
gemini-pro:      ~20% of requests
claude-pro:      ~15% of requests  ← Protect this budget
```
