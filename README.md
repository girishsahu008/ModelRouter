# ModelRouter

**Save your Claude Pro credits** by automatically routing coding tasks to free AI models — transparently, with zero changes to your workflow.

Built with [Beads](https://github.com/badlogic/beads) for AI-native issue tracking and [Graphify](https://github.com/badlogic/graphify) for codebase knowledge — both stay active across every `claude-mix` session automatically.

> Run `claude-mix` instead of `claude`. Everything else stays the same.

---

## How It Works

ModelRouter is a local HTTP proxy that sits between Claude Code and Anthropic's API. Every request is classified by task type and routed to the cheapest model capable of handling it. Only genuinely complex tasks (architecture, security, system design) ever reach Claude Pro.

```
You type a message in Claude Code
        │
        ▼
┌──────────────────┐
│  ModelRouter     │  ← transparent proxy on localhost:8082
│  Classifier      │  ← matches routing rules (YAML, first-match-wins)
└──────┬───────────┘
       │
       ├─ Trivial / Read / Basic Q   →  Gemma 3 27B  (Google free API/ Locall Ollama, ~1s)
       ├─ Tests / Debugging          →  Codex CLI     (OpenAI free tier)
       ├─ Feature implementation     →  Gemini 2.5 Pro (Google free API)
       ├─ [Fallback chain]           →  tries next backend if one fails
       └─ Architecture / Complex     →  Claude Pro    (your subscription)
```

Each routing decision is tagged in the response:
```
`[via: gemma-3-27b (Google) • 1.2s]`
```

---

## Backends

| Backend | Model | Cost | Speed | Used for |
|---|---|---|---|---|
| **Gemma** | `gemma-3-27b-it` via Google AI | Free | ~1s | Trivial, read, basic questions |
| **Gemini Flash** | `gemini-2.5-flash` | Free tier | ~2s | Medium tasks, fallback |
| **Gemini Pro** | `gemini-2.5-pro` | Free tier | ~3s | Feature implementation |
| **Codex CLI** | OpenAI Codex | Free tier | ~4s | Tests, debugging |
| **Ollama** | Any local model | Free (local) | varies | Offline fallback |
| **Claude Pro** | `claude-*` | Subscription | ~3s | Complex architecture only |

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Claude Code](https://claude.ai/code) installed
- A free [Google AI Studio](https://aistudio.google.com) API key
- (Optional) [Ollama](https://ollama.com/) for offline fallback
- [Codex CLI](https://github.com/openai/codex) (`npm install -g @openai/codex`)

### Install

```bash
git clone https://github.com/your-username/ModelRouter
cd ModelRouter
npm install
```

### Configure your Gemini API key


export GOOGLE_API_KEY=your_key_here in .env file.


Get a free key at [aistudio.google.com](https://aistudio.google.com) — no billing required.

### Register the `claude-mix` command

**Windows:**
```cmd
npm link
```

**macOS / Linux:**
```bash
sudo npm link
```

### Run

```bash
# Instead of: claude
claude-mix

# Pass any claude flags normally
claude-mix --model claude-opus-4-7
```

The router starts automatically in the background. Claude Code is launched with `ANTHROPIC_BASE_URL` pointing at the local proxy.

---

## Routing Rules

Rules live in `config/routing-rules.yaml`. They are evaluated top-to-bottom — first match wins.

```yaml
rules:
  - name: "Trivial"
    target: gemma
    conditions:
      patterns: ["syntax error", "typo", "rename", "format", "indent"]
      max_length: 300
    exclude_patterns: ["architect", "implement", "refactor"]

  - name: "Read & Explain"
    target: gemma
    conditions:
      patterns: ["read", "show me", "explain", "summarize", "what does"]

  - name: "Testing"
    target: codex
    conditions:
      patterns: ["write test", "unit test", "debug", "stack trace"]

  - name: "Features"
    target: gemini-pro
    conditions:
      patterns: ["implement", "create", "build", "add feature", "endpoint"]
      max_length: 2000

  - name: "Complex"
    target: claude
    conditions:
      patterns: ["architect", "design system", "microservice", "security audit"]
```

### Inline override

Force a specific model for any single message:

```
[use:gemini-pro] refactor this entire module
[use:claude] design the auth system
[use:gemma] what does this function return?
```

---

## Fallback Chains

If a backend fails (rate limited, offline, error), the router automatically tries the next one:

| Primary target | Fallback chain |
|---|---|
| `gemma` | gemma → ollama → gemini-flash → passthrough |
| `codex` | codex → gemma → gemini-flash → passthrough |
| `gemini-flash` | gemini-flash → gemma → gemini-pro → passthrough |
| `gemini-pro` | gemini-pro → gemini-flash → gemma → passthrough |
| `claude` | passthrough (direct to Anthropic) |

`passthrough` means the request goes directly to Claude Pro as normal.

---

## Commands

```bash
# Start router + Claude Code
claude-mix

# Start router only (background daemon)
node start.js

# Health check
curl http://127.0.0.1:8082/health

# Kill router
npx kill-port 8082 8083
```

---
Note: start.js need to be started for calude-mix to route requests.
## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_API_KEY` | hardcoded in gemini.js | Google AI Studio API key |
| `ROUTER_PORT` | `8082` | Port for Anthropic proxy |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `gemma3:1b` | Local Ollama model to use |
| `OLLAMA_KEEP_ALIVE` | `-1` | Keep model loaded in RAM indefinitely |

---

## Project Structure

```
ModelRouter/
├── bin/
│   ├── claude-mix.js        # Main entry point — starts services + launches Claude Code
│   ├── claude-mix.cmd       # Windows shim
│   └── claude-router.js     # Stats/management CLI
├── src/
│   ├── router-service.js    # HTTP proxy server (port 8082)
│   ├── openai-adapter.js    # OpenAI-format proxy for Codex CLI (port 8083)
│   ├── classifier.js        # Prompt → routing target
│   ├── stats.js             # Usage tracking
│   └── connectors/
│       ├── gemini.js        # Google Gemini + Gemma API
│       ├── ollama.js        # Local Ollama
│       └── codex.js         # Codex CLI via stdin
├── config/
│   └── routing-rules.yaml   # Routing rules (editable)
├── start.js                 # Starts both proxy servers
└── package.json
```

---

## Usage Stats

Stats are saved to `~/.claude-router/usage-stats.json`. View a summary:

```bash
node -e "const s=require('./src/stats'); console.log(JSON.stringify(s.summary(7*24*60*60*1000), null, 2))"
```

Example output:
```json
{
  "total": 312,
  "byTarget": {
    "gemma→gemma": 187,
    "Testing→codex": 43,
    "Features→gemini-pro": 61,
    "claude": 21
  }
}
```

---

## Session Context Across Models

Claude Code sends the full conversation history with every request. ModelRouter does not need to manage sessions — it reads the history Claude Code provides and passes a tailored window to each backend:

- **Gemma / Ollama**: last 6–8 messages, truncated to 400 chars each
- **Gemini**: last 8 messages, 500-char system prompt
- **Claude**: full history, no truncation

This means context is preserved across model switches within a session. Older turns are truncated for cheaper models but the semantic continuity is maintained through Claude Code's accumulated history.

---

## FAQ

**Q: Does `claude` still work normally?**  
A: Yes. `claude-mix` is a separate command. `claude` is untouched.

**Q: What if I don't have Ollama?**  
A: Ollama is optional. The fallback chain skips it and goes to Gemini if Ollama is unavailable.

**Q: Is my code sent to multiple providers?**  
A: No. Each request goes to exactly ONE backend — whichever the classifier selects.

**Q: What if Gemini rate limits me?**  
A: The fallback chain automatically tries the next backend. You won't notice.

**Q: Can I add my own routing rules?**  
A: Yes — edit `config/routing-rules.yaml`. Rules are hot-reloaded on each request.

**Q: Does this work on macOS/Linux?**  
A: Yes. The Codex connector uses `cmd /c` only on Windows; macOS/Linux uses the binary directly.

---

## Development Tooling

This project is built and maintained using two AI-native dev tools that work inside `claude-mix` sessions:

### [Beads](https://github.com/badlogic/beads) — Issue Tracker

All tasks and bugs are tracked with `bd` (beads), a graph-based issue tracker that persists across sessions.

```bash
bd ready                        # see available work
bd create --title="..." --type=feature --priority=2
bd update <id> --claim          # start working
bd close <id>                   # mark done
bd remember "insight to keep"   # persist knowledge across sessions
```

Beads is automatically primed on every `claude-mix` session via the `UserPromptSubmit` hook in `~/.claude/settings.json`.

### [Graphify](https://github.com/badlogic/graphify) — Code Knowledge Graph

Graphify builds a semantic graph of the codebase and exposes it as a knowledge base Claude reads before answering architecture questions.

```bash
# Rebuild the graph after code changes
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

The graph output lives in `graphify-out/`. Claude reads `graphify-out/GRAPH_REPORT.md` automatically before architecture decisions.

Both tools are injected via `--append-system-prompt` in `claude-mix` so they are always active regardless of context compaction.

---

## Contributing

1. Fork the repo
2. Create a beads issue (`bd create`) or GitHub issue to discuss your change
3. Submit a PR with a clear description

All routing logic is in `src/classifier.js` and `config/routing-rules.yaml` — easy to extend.

---

## License

MIT — see [LICENSE](LICENSE)

---

## Credits

- [Ollama](https://ollama.com/) — local model serving
- [Google Gemini API](https://ai.google.dev/) — free hosted inference
- [OpenAI Codex CLI](https://github.com/openai/codex) — free coding assistant
- [Beads](https://github.com/badlogic/beads) — AI-native issue tracker
- [Graphify](https://github.com/badlogic/graphify) — codebase knowledge graph
- [Claude Code](https://claude.ai/code) — the best coding assistant, used where it matters
