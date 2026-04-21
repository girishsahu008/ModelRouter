# Contributing to ModelRouter

Thanks for your interest in contributing! Here's everything you need to get started.

---

## Ground Rules

- `main` is protected — no direct pushes. All changes go through a Pull Request.
- One feature or fix per PR — keep it focused.
- Test your change locally before submitting (`node start.js` + a curl test).

---

## Workflow

### 1. Fork and clone

Click **Fork** on [github.com/girishsahu008/ModelRouter](https://github.com/girishsahu008/ModelRouter), then clone your fork:

```bash
git clone https://github.com/your-username/ModelRouter
cd ModelRouter
npm install
```

### 2. Create a branch

Never work on `main`. Create a descriptive branch:

```bash
git checkout -b fix/gemini-rate-limit
# or
git checkout -b feature/groq-connector
# or
git checkout -b docs/improve-setup-guide
```

Branch naming conventions:
- `fix/` — bug fixes
- `feature/` — new functionality
- `docs/` — documentation only
- `chore/` — config, deps, tooling

### 3. Make your change

Key files:
- **New routing rule** → `config/routing-rules.yaml`
- **New backend connector** → `src/connectors/<name>.js`
- **Routing logic** → `src/classifier.js`
- **Fallback chains** → `src/router-service.js`

### 4. Test it locally

```bash
# Start the router
node start.js

# Send a test request
curl -s -X POST http://127.0.0.1:8082/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":100,"messages":[{"role":"user","content":"your test prompt here"}]}'
```

Check the router logs to confirm the correct backend was selected.

### 5. Commit and push

```bash
git add .
git commit -m "fix: describe what you changed and why"
git push origin fix/your-branch-name
```

Commit message prefixes: `fix:`, `feat:`, `docs:`, `chore:`

### 6. Open a Pull Request

Go to your fork on GitHub and click **Compare & pull request**. Target branch: `main`.

In your PR description include:
- What you changed
- Why (link the issue if there is one)
- How you tested it (curl output or router log snippet)

---

## Good First Contributions

- Add a routing rule to `config/routing-rules.yaml` for a pattern not currently covered
- Add a new backend connector (Groq, DeepSeek, Together AI, etc.)
- Fix macOS/Linux compatibility (most development was on Windows)
- Improve token truncation logic in any connector
- Add usage stats CLI output to `bin/claude-router.js`

---

## Questions?

Open a [GitHub Issue](https://github.com/girishsahu008/ModelRouter/issues) or email [girish.sahu@gmail.com](mailto:girish.sahu@gmail.com).
