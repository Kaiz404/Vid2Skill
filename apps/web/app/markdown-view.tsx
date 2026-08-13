"use client";

import { isValidElement, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { CheckIcon, CopyIcon } from "./icons";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

function extractFrontmatter(markdown: string): { name?: string; description?: string; body: string } {
  const match = FRONTMATTER_RE.exec(markdown);
  if (!match) return { body: markdown };

  const yaml = match[1] ?? "";
  const body = markdown.slice(match[0].length);
  const nameMatch = /^name:\s*(.+)\s*$/m.exec(yaml);
  const descMatch = /^description:\s*"((?:[^"\\]|\\.)*)"\s*$/m.exec(yaml);

  return {
    name: nameMatch?.[1]?.trim(),
    description: descMatch?.[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"),
    body,
  };
}

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children);
  return "";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard access denied/unavailable - nothing more we can do here
    }
  }

  return (
    <button type="button" className="code-copy" onClick={handleCopy} aria-label="Copy code">
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Pre({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
  const codeElement = Array.isArray(children) ? children[0] : children;
  const codeClassName = (isValidElement<{ className?: string }>(codeElement) && codeElement.props.className) || "";
  const lang = /language-(\w+)/.exec(codeClassName)?.[1];
  const rawText = extractText(codeElement);

  return (
    <div className="code-block">
      <div className="code-block-head">
        <span className="code-lang">{lang ?? "text"}</span>
        <CopyButton text={rawText} />
      </div>
      <pre {...props}>{children}</pre>
    </div>
  );
}

function Code({ className, children, ...props }: ComponentPropsWithoutRef<"code">) {
  const isBlock = className?.includes("hljs");
  if (!isBlock) {
    return (
      <code className="inline-code" {...props}>
        {children}
      </code>
    );
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

function Anchor({ href, children, ...props }: ComponentPropsWithoutRef<"a">) {
  const isExternal = !!href && /^https?:\/\//.test(href);
  return (
    <a href={href} {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})} {...props}>
      {children}
    </a>
  );
}

function Table({ children, ...props }: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="table-wrap">
      <table {...props}>{children}</table>
    </div>
  );
}

const components: Components = {
  pre: Pre,
  code: Code,
  a: Anchor,
  table: Table,
};

interface MarkdownViewProps {
  content: string;
  mode: "skill" | "summary";
}

export function MarkdownView({ content, mode }: MarkdownViewProps) {
  const { name, description, body } = mode === "skill" ? extractFrontmatter(content) : { body: content, name: undefined, description: undefined };

  return (
    <div className="markdown-view">
      {(name || description) && (
        <div className="markdown-frontmatter">
          {name && <div className="fm-name">{name}</div>}
          {description && <div className="fm-desc">{description}</div>}
        </div>
      )}
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
          {body}
        </ReactMarkdown>
      </div>
    </div>
  );
}
