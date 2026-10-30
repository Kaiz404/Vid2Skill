export const SKILL_MODE_INSTRUCTION = `You are creating a Claude Agent Skill from a YouTube video transcript piped to you via stdin. The source video is a developer-focused educational video - dev advice, software architecture, or design talk. Extract the durable engineering knowledge so another AI agent can reuse it later.

Output format requirements - follow exactly:
1. Output ONLY the raw content of a SKILL.md file. No preamble, no "Here is...", no explanation, no markdown code fences wrapping the whole output.
2. Start with YAML frontmatter delimited by lines containing exactly \`---\`, with exactly two fields:
   - name: a short kebab-case slug (lowercase, hyphens only, 2-5 words) identifying the skill
   - description: one sentence, third person, written as "Use this skill when ..." describing the triggering situation and what it helps with. Do not just restate the video title.
3. After the closing \`---\`, write the body in markdown with these sections (omit a section only if genuinely not applicable):
   - # <Title>
   - ## Overview - 2-4 sentences on what this skill covers and why it's useful
   - ## Key Concepts - important patterns, principles, or terminology as a bulleted list with brief definitions
   - ## Instructions - the concrete step-by-step process, design approach, or checklist from the video, written as actionable steps another AI agent could follow
   - ## Reference (optional) - trade-off tables, commands, terminology, or facts worth a quick lookup
4. Write for an AI agent reusing this knowledge later, not a human viewer. Extract durable engineering knowledge - patterns, trade-offs, decision criteria, step-by-step processes. Strip filler, timestamps, sponsor reads, small talk.
5. Do not fabricate information absent from the transcript.

The transcript follows below.`;

export const SUMMARY_MODE_INSTRUCTION = `You are writing a plain markdown summary of a YouTube video transcript piped to you via stdin.

Output format requirements - follow exactly:
1. Output ONLY the raw markdown. No preamble, no explanation, no surrounding code fences.
2. Start with a single \`# <Video Title>\` heading.
3. Follow with:
   - ## Summary - concise overview (1-2 paragraphs)
   - ## Key Points - bulleted list of main takeaways
   - ## Notable Details - specific facts, numbers, quotes, or references worth preserving
4. Each transcript line starts with a timestamp like [12:34]. End every Key Points and Notable Details bullet with the timestamp of the transcript line it comes from, copied exactly in square brackets, e.g. "- Caching cut latency in half [12:34]". Only use timestamps that appear in the transcript.
5. Do not fabricate information absent from the transcript. Do NOT include YAML frontmatter - this is a plain summary, not a Claude skill.

The transcript follows below.`;

export function buildStdinPayload(title: string, url: string, transcriptMarkdown: string): string {
  return `Video title: ${title}\nVideo URL: ${url}\n\n${transcriptMarkdown}`;
}
