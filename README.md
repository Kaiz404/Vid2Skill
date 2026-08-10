# vid2skill

![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![Status](https://img.shields.io/badge/status-early--wip-yellow)

Turn a YouTube video into a Claude Agent Skill or a markdown summary.

<video src="https://github.com/user-attachments/assets/a674d672-f893-4d0e-8042-540f5a97f9ca" controls muted width="720"></video>

## Why this exists

I consume a lot of educational content, and a lot of the best resources I learn from are videos — 10, 20 minutes long, densely packed with high quality knowledge. The problem is that video is slow. I read faster than I watch, and I find reading a lot more engaging when the material is dense — I can skim, re-read a paragraph, and move at my own pace instead of the speaker's.

On top of that, most of what I learn from these videos ends up getting applied back into agents and my own projects anyway. So instead of watching a video, taking notes by hand, and then turning those notes into something an agent can use, I figured I'd just cut out the middle step entirely.

`vid2skill` takes a YouTube URL, pulls the transcript, and hands it to Claude to turn directly into either a [Claude Agent Skill](https://claude.com/blog/skills) (a `SKILL.md` ready to drop into any project) or a clean markdown summary — whichever you need.

## What it does

- **Skill mode** — generates a `SKILL.md` with proper YAML frontmatter (`name` + `description`), structured into an overview, key concepts, step-by-step instructions, and a reference section. Drop the output folder straight into `.claude/skills/` in any project.
- **Summary mode** — generates a plain markdown summary (summary, key points, notable details) when you just want the notes, not a skill.
- **A terminal that doesn't leave you hanging** — a spinner tracks what's actually happening (fetching the transcript, generating the skill, retrying if the output came back malformed, writing the files) instead of sitting there silently for a minute or two.

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

## Prerequisites

- Python 3.10+
- [Node.js](https://nodejs.org/) 22+ on your `PATH` — yt-dlp needs a JS runtime to solve YouTube's in-page challenge before it can fetch anything, and this project is pinned to use Node
- The [Claude Code](https://claude.com/product/claude-code) CLI (`claude`) installed, on your `PATH`, and logged in — `vid2skill` shells out to it, it doesn't call the API directly
- Usually, a `cookies.txt` exported from a logged-in YouTube session — see [below](#cookies-usually-required)

## Install

Not published anywhere yet, so install straight from source:

```bash
git clone https://github.com/Kaiz404/Vid2Skill.git
cd Vid2Skill
pip install -e .
```

This installs the `vid2skill` command.

## Usage

```bash
vid2skill "https://www.youtube.com/watch?v=..."
vid2skill "https://youtu.be/..." --mode summary
vid2skill "https://www.youtube.com/watch?v=..." --cookies cookies.txt --output-dir ./skills
```

| Flag | Default | Description |
|---|---|---|
| `url` | — | YouTube video URL (watch, `youtu.be`, shorts, embed, or live) |
| `--mode {skill,summary}` | `skill` | Generate a Claude Agent Skill or a plain markdown summary |
| `--output-dir` | `./output` | Where the generated file(s) get written |
| `--timeout` | `300` | Seconds to wait for the `claude` CLI to respond |
| `--cookies` | — | Path to a `cookies.txt` (see below) |

### Cookies (usually required)

YouTube frequently blocks anonymous, unauthenticated caption requests, so you'll often need to pass a `cookies.txt` from a real logged-in session:

<details>
<summary>How to export cookies.txt</summary>

1. Install a browser extension like [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc).
2. Log into YouTube in that browser.
3. Use the extension to export cookies for `youtube.com` as a `cookies.txt` file.
4. Pass it via `--cookies path/to/cookies.txt`.

</details>

> [!WARNING]
> Never commit your `cookies.txt` — it contains live session auth tokens. This repo's `.gitignore` already excludes `cookies.txt` and `*.cookies.txt`, but keep that in mind if you copy it elsewhere.

## Caveats

> [!IMPORTANT]
> This tool needs an active [Claude Code](https://claude.com/product/claude-code) login/subscription. It shells out to the local `claude` CLI (`claude -p ...`) — there's no built-in fallback to call the Anthropic API directly. If `claude` isn't on your `PATH` and logged in, nothing will work.

> [!NOTE]
> If Node.js isn't installed, yt-dlp can't resolve real video formats (only image formats), and transcript fetching will fail even though the video clearly has captions.

> [!WARNING]
> This is a young, single-author project — no automated CI, no published package, no license yet. It works well enough for daily use on my end, but expect rough edges.
