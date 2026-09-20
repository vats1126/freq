import type { Attempt, Level, Question } from "./types";

/**
 * Adaptive difficulty (PRD section 11).
 *
 * The engine looks at the last LEVEL_WINDOW (5) answers since the level last changed:
 *
 *   5 of 5 correct          -> level up
 *   3 of 5 correct (or any  -> hold
 *   result in between)
 *   1 of 5 or fewer correct -> level down AND run a prerequisite check
 *                              (with fewer than 5 answers, 3 or more answers with at most 20% correct counts,
 *                               so a run of misses is noticed early instead of after five)
 *
 * Skipped questions count as wrong. Level never goes below 1 or above 4; at Level 1 a struggling
 * student stays put but the prerequisite check still runs.
 */

export const LEVEL_WINDOW = 5;
export const MIN_ANSWERS_TO_LOWER = 3;
export const LOWER_AT_OR_BELOW = 0.2;

export const LEVEL_NAMES: Record<Level, string> = { 1: "Identify", 2: "Apply", 3: "Solve", 4: "Challenge" };
export const LEVEL_BLURB: Record<Level, string> = {
  1: "Recognise the key ideas",
  2: "Use the relationship",
  3: "Find a missing quantity",
  4: "Multi-step problems",
};

export type LevelChange = "up" | "down" | "hold";

export interface LevelDecision {
  level: Level;
  change: LevelChange;
  /** True when the student is struggling, so the prerequisites should be examined. */
  checkPrerequisites: boolean;
  reason: string;
}

export function decideLevel(current: Level, windowAttempts: Attempt[]): LevelDecision {
  const w = windowAttempts.slice(-LEVEL_WINDOW);
  const n = w.length;
  const right = w.filter((a) => a.correct).length;

  if (n === LEVEL_WINDOW && right === LEVEL_WINDOW) {
    if (current < 4) return { level: (current + 1) as Level, change: "up", checkPrerequisites: false, reason: `5 of 5 correct, so AURA is raising the challenge to Level ${current + 1}.` };
    return { level: current, change: "hold", checkPrerequisites: false, reason: "5 of 5 correct at the top level. Keep going." };
  }

  if (n >= MIN_ANSWERS_TO_LOWER && right / n <= LOWER_AT_OR_BELOW) {
    if (current > 1) return { level: (current - 1) as Level, change: "down", checkPrerequisites: true, reason: `Only ${right} of your last ${n} were correct, so AURA is easing to Level ${current - 1} and checking the building blocks.` };
    return { level: current, change: "hold", checkPrerequisites: true, reason: `Only ${right} of your last ${n} were correct at the lowest level, so AURA is checking the building blocks.` };
  }

  return { level: current, change: "hold", checkPrerequisites: false, reason: "" };
}

export interface LevelWindowView {
  /** Results since the level last changed, newest last (max 5). */
  dots: boolean[];
  /** e.g. "3 of 5 correct". */
  summary: string;
  /** What would happen next, in plain words. */
  next: string;
}

/** A read-only description of where the student is in the adaptive window, for the UI. */
export function describeWindow(current: Level, windowAttempts: Attempt[]): LevelWindowView {
  const w = windowAttempts.slice(-LEVEL_WINDOW);
  const right = w.filter((a) => a.correct).length;
  const dots = w.map((a) => a.correct);
  const summary = w.length ? `${right} of ${w.length} correct at Level ${current}` : `No answers yet at Level ${current}`;
  let next: string;
  if (current < 4 && w.length < LEVEL_WINDOW && right === w.length) next = `${LEVEL_WINDOW - w.length} more correct in a row to reach Level ${current + 1}`;
  else if (current < 4 && w.length === LEVEL_WINDOW && right === LEVEL_WINDOW) next = `Level ${current + 1} is next`;
  else if (w.length >= MIN_ANSWERS_TO_LOWER && right / w.length <= LOWER_AT_OR_BELOW + 0.15) next = "A few more misses would lower the level and trigger a prerequisite check";
  else next = `5 of 5 correct moves you up. 3 of 5 keeps the level. 1 of 5 lowers it`;
  return { dots, summary, next };
}

/**
 * Choose the next question.
 *  1. An unseen question at the student's level (not shown earlier this session).
 *  2. If that level is exhausted, repeat questions at the same level (never the one just shown).
 *  3. Fall back to neighbouring levels only when the level has no other candidate.
 * Within a pool, questions the student has never attempted come first, then the least recently attempted.
 */
export function pickQuestion(opts: {
  questions: Question[];
  level: Level;
  history: Attempt[];
  /** Questions already shown this session, oldest first. */
  exclude?: string[];
}): Question | null {
  const { questions, level, history, exclude = [] } = opts;
  const lastSeen = new Map<string, string>();
  for (const a of history) lastSeen.set(a.questionId, a.createdAt);

  const order = (pool: Question[]) =>
    [...pool].sort((a, b) => Number(lastSeen.has(a.id)) - Number(lastSeen.has(b.id)) || (lastSeen.get(a.id) ?? "").localeCompare(lastSeen.get(b.id) ?? "") || a.id.localeCompare(b.id));

  const just = exclude[exclude.length - 1];
  const shownThisSession = new Set(exclude);

  // 1. Fresh question at the student's level
  const atLevel = questions.filter((q) => q.level === level);
  const freshAtLevel = atLevel.filter((q) => !shownThisSession.has(q.id));
  if (freshAtLevel.length) return order(freshAtLevel)[0];

  // 2. Repeat at the same level (excluding the question just shown)
  const repeatAtLevel = atLevel.filter((q) => q.id !== just);
  if (repeatAtLevel.length) return order(repeatAtLevel)[0];

  // 3. Fall back to neighbouring levels if this level has no other candidate
  const otherLevels = ([1, 2, 3, 4] as Level[])
    .filter((l) => l !== level)
    .sort((a, b) => Math.abs(a - level) - Math.abs(b - level) || a - b);

  for (const l of otherLevels) {
    const atL = questions.filter((q) => q.level === l);
    const fresh = atL.filter((q) => !shownThisSession.has(q.id));
    if (fresh.length) return order(fresh)[0];
  }

  for (const l of otherLevels) {
    const atL = questions.filter((q) => q.level === l);
    const repeat = atL.filter((q) => q.id !== just);
    if (repeat.length) return order(repeat)[0];
  }

  const repeat = questions.filter((q) => q.id !== just);
  return repeat.length ? order(repeat)[0] : questions[0] ?? null;
}

/** Grade a submitted answer. Numeric answers ignore units and whitespace. */
export function gradeAnswer(q: Question, raw: string): boolean {
  const answer = raw.trim();
  if (!answer) return false;
  if (q.type === "mcq") return answer === q.answer;
  const cleaned = answer.replace(/,/g, "").replace(/[×x]\s*10\^?/i, "e");
  const m = cleaned.match(/^[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
  if (!m || q.numericAnswer === undefined) return false;
  const value = Number(m[0]);
  return Number.isFinite(value) && Math.abs(value - q.numericAnswer) <= (q.tolerance ?? 0.01);
}
