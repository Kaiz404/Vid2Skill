# vid2skill

![TypeScript](https://img.shields.io/badge/typescript-5.7-blue)
![Status](https://img.shields.io/badge/status-early--wip-yellow)

Turn a YouTube video into a Claude Agent Skill or a markdown summary. Try it live at the deployed dashboard, or run it as a CLI.

<video src="https://github.com/user-attachments/assets/2f6f5d67-9e89-4bb9-b1eb-e3f653b383c5" controls muted width="720"></video>

## Why this exists

I consume a lot of educational content, and a lot of the best resources I learn from are videos — 10, 20 minutes long, densely packed with high quality knowledge. The problem is that video is slow. I read faster than I watch, and I find reading a lot more engaging when the material is dense — I can skim, re-read a paragraph, and move at my own pace instead of the speaker's.

On top of that, most of what I learn from these videos ends up getting applied back into agents and my own projects anyway. So instead of watching a video, taking notes by hand, and then turning those notes into something an agent can use, I figured I'd just cut out the middle step entirely.

`vid2skill` takes a YouTube URL, pulls the transcript, and hands it to an LLM to turn directly into either a [Claude Agent Skill](https://claude.com/blog/skills) (a `SKILL.md` ready to drop into any project) or a clean markdown summary — whichever you need.

## What it does

- **Skill mode** — generates a `SKILL.md` with proper YAML frontmatter (`name` + `description`), structured into an overview, key concepts, step-by-step instructions, and a reference section. Drop it straight into `.claude/skills/` in any project.
- **Summary mode** — generates a plain markdown summary (summary, key points, notable details) when you just want the notes, not a skill.
- **A dashboard that doesn't leave you hanging** — paste a link and watch a live two-step progress stream (fetching the transcript, generating with AI, auto-retrying once if the output comes back malformed) instead of staring at a spinner with no context.
- **A CLI for the terminal-first workflow** — same pipeline, same phase-by-phase spinner, writes straight to `./output`.

## Example output

A trimmed real example, generated from a talk on AI-assisted development practices:

```markdown
---
name: ai-assisted-code-quality
description: "Use this skill when directing an AI coding agent to build or modify
  a software system, to keep the codebase good enough that AI assistance stays
  productive instead of degrading with each iteration."
---

# Software Fundamentals for AI-Assisted Development

## Overview
When using AI coding agents (via specs-to-code loops, autonomous agents, or
pair-programming), naive "regenerate from spec" workflows tend to degrade code
quality over successive iterations, producing increasingly complex, hard-to-change
code. This skill captures practices for keeping a codebase good...

## Key Concepts
- **Specs-to-code trap**: Treating the spec as the only source of truth and never
  reading/reviewing generated code causes quality to degrade with each regeneration
  cycle — this is "vibe coding" under another name.
- **Complexity (Ousterhout, *A Philosophy of Software Design*)**: Anything about a
  system's structure that makes it hard to understand or modify...
```

That's a 20-minute talk turned into something I can skim in under a minute and immediately load into an agent — no manual note-taking in between.

## Architecture

A pnpm-workspaces TypeScript monorepo, no Turborepo/Nx needed at this scale:

- `packages/core/` — the shared pipeline: a [Supadata](https://supadata.ai) transcript client, an [OpenRouter](https://openrouter.ai) LLM client, prompt templates, `SKILL.md` parsing/writing, and slug logic. Exposes the same phase-callback pattern (`extract` → `fetch_captions` → `generate` → `retry`? → `write`) that both the CLI and the web app subscribe to.
- `apps/cli/` — a thin CLI wrapper around `packages/core`, with a spinner that cycles flavor text per pipeline phase.
- `apps/web/` — a Next.js dashboard (paste a URL, watch progress over Server-Sent Events, get back a Skill or Summary) plus its API routes. Global (not per-user) rate limiting — a concurrency cap and an hourly quota — is backed by Upstash Redis, since Vercel functions share no memory across invocations.

No accounts, no auth, no history kept server-side — jobs live in Redis for an hour and then expire.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+
- A [Supadata](https://supadata.ai) API key (free tier: 100 credits/month)
- An [OpenRouter](https://openrouter.ai) API key (the default model, `nvidia/nemotron-3-super-120b-a12b:free`, is free)
- For `apps/web` only: an [Upstash Redis](https://upstash.com) database (REST URL + token, free tier)

## Install

```bash
git clone https://github.com/Kaiz404/Vid2Skill.git
cd Vid2Skill
pnpm install
```

## CLI usage

```bash
export SUPADATA_API_KEY=...
export OPENROUTER_API_KEY=...

pnpm --filter @vid2skill/cli build
node apps/cli/dist/index.js "https://www.youtube.com/watch?v=..."
node apps/cli/dist/index.js "https://youtu.be/..." --mode summary
```

(Or drop the two keys into a `.env` file in your working directory instead of exporting them — the CLI loads it automatically.)

| Flag | Default | Description |
|---|---|---|
| `url` | — | YouTube video URL (watch, `youtu.be`, shorts, embed, or live) |
| `--mode <skill\|summary>` | `skill` | Generate a Claude Agent Skill or a plain markdown summary |
| `--output-dir <dir>` | `./output` | Where the generated file gets written |
| `--timeout <seconds>` | `300` | Seconds to wait for the LLM call |

## Web app

```bash
cp .env.example apps/web/.env.local   # fill in the keys below
pnpm --filter @vid2skill/web dev
```

`apps/web/.env.local` needs: `SUPADATA_API_KEY`, `OPENROUTER_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and optionally `UMAMI_WEBSITE_ID` for analytics.

Deploys to [Vercel](https://vercel.com)'s free tier — `vercel deploy` from `apps/web/`, or push to the linked GitHub repo.

## Development

```bash
pnpm test        # Vitest, all packages
pnpm typecheck    # tsc --noEmit, all packages
pnpm build        # build packages/core, apps/cli, apps/web
```

## Caveats

> [!NOTE]
> The rate-limiting numbers (2 concurrent jobs, 30 generations/hour, both global across all visitors) are conservative starting defaults for a low-traffic showcase, tuned to protect the free OpenRouter/Supadata tiers — not final figures.

> [!WARNING]
> This is a young, single-author project — no automated CI, no published package, no license yet. It works well enough for daily use on my end, but expect rough edges.
