/**
 * Terminal presentation: spinner with cycling flavor text, styled messages.
 * Kept separate from the CLI entrypoint so the spinner logic stays isolated.
 */
import ora, { type Ora } from "ora";
import pc from "picocolors";

const TICK_MS = 2500;

const PHASE_FLAVORS: Record<string, string[]> = {
  extract: ["Getting started", "Figuring out where this came from"],
  fetch_captions: ["Fetching captions", "Wrangling captions", "Talking to YouTube"],
  generate_skill: ["Cooking skill", "Simmering skill", "Distilling knowledge"],
  generate_summary: ["Summarizing", "Condensing", "Boiling it down"],
  retry: ["Redoing that", "Taking another pass"],
  write: ["Plating", "Saving files"],
};

function choice(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export class Spinner {
  private mode: "skill" | "summary";
  private phase = "extract";
  private startedAt = performance.now();
  private timer: NodeJS.Timeout | undefined;
  private spinner: Ora;

  constructor(mode: "skill" | "summary") {
    this.mode = mode;
    this.spinner = ora({ text: this.render(), spinner: "dots" });
  }

  private poolKey(phase: string): string {
    if (phase === "generate") return this.mode === "skill" ? "generate_skill" : "generate_summary";
    return phase;
  }

  private render(): string {
    const elapsed = Math.floor((performance.now() - this.startedAt) / 1000);
    const pool = PHASE_FLAVORS[this.poolKey(this.phase)] ?? [this.phase];
    return `${pc.bold(pc.cyan(`${choice(pool)}…`))} (${elapsed}s)`;
  }

  begin(): this {
    this.spinner.start();
    this.timer = setInterval(() => (this.spinner.text = this.render()), TICK_MS);
    return this;
  }

  updatePhase = (phase: string): void => {
    this.phase = phase;
    this.spinner.text = this.render();
  };

  get elapsedSeconds(): number {
    return (performance.now() - this.startedAt) / 1000;
  }

  stop(): void {
    clearInterval(this.timer);
    this.spinner.stop();
  }
}

export function success(message: string): void {
  console.log(`${pc.bold(pc.green("✔"))} ${message}`);
}

export function error(message: string): void {
  console.error(`${pc.bold(pc.red("✖"))} ${message}`);
}
