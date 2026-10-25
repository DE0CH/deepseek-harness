# DE0CH fork of DeepSeek Harness

The `dsh` harness of Jarvis 4 (DE0CH/jarvis4 `session-image/base/harness-dsh.sh`) runs this fork. Changes against
upstream are kept small so `main` merges upstream `master` cleanly (never a force-push or rebase of `main`):

- `packages/context/agent-instructions`: opt-in `expandImports` / `maxImportDepth`, Claude Code style `@path` imports
  in CLAUDE.md / AGENTS.md.
- `packages/llm/llm-pi-ai`: `compat.openRouterRouting` is offered on `openai-completions` routes (pin OpenRouter
  requests to one provider).
- `de0ch/runtime-bundle.sh` and `.github/workflows/de0ch-dsh-runtime.yml`: the runtime bundle (Node + dsh npm-installed
  from this commit's own release tarballs), released as `de0ch-<sha12>` and pinned by jarvis4's `fork-pin.yml`.
  Upstream's workflows are disabled in the fork's Actions settings.

Merge upstream: `git fetch upstream && git merge upstream/master`, then push `main`.
