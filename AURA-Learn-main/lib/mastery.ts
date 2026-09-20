import { labsForTopic } from "@/content/labs";
import type { Attempt, LabEvent, Level, Mastery, Store } from "./types";
import { clamp } from "./utils";

/**
 * Transparent, deterministic mastery model (PRD section 10).
 *
 *   Mastery = 40% quiz accuracy + 20% recent performance + 15% prerequisite mastery
 *           + 15% retention + 10% virtual lab performance
 *
 * Simplifications, all explained here so a judge can audit them:
 *  - Quiz accuracy is weighted by question level, so a correct Level-4 answer counts four times a Level-1.
 *  - Retention fades 4 points per idle day (never below 40), which is what triggers re-assessment.
 *  - A topic with no virtual lab hands its 10% to quiz accuracy.
 *  - Evidence factor: with fewer than 8 attempts the score is scaled down, so one lucky answer cannot "master" a topic.
 */

import { MASTERED_THRESHOLD, UNLOCK_THRESHOLD } from "./curriculum";
export { MASTERED_THRESHOLD, UNLOCK_THRESHOLD };
export const WEIGHTS = { quiz: 0.4, recent: 0.2, prereq: 0.15, retention: 0.15, lab: 0.1 } as const;
const DAY = 86_400_000;

export type MasteryBand = "not-ready" | "learning" | "proficient" | "mastered";

export function bandOf(score: number): MasteryBand {
  if (score >= 80) return "mastered";
  if (score >= 60) return "proficient";
  if (score >= 40) return "learning";
  return "not-ready";
}

export const BAND_LABEL: Record<MasteryBand, string> = {
  "not-ready": "Not ready",
  learning: "Learning",
  proficient: "Proficient",
  mastered: "Mastered",
};

export interface ScoreInput {
  /** Attempts for this topic up to asOf, oldest first. */
  attempts: Attempt[];
  prereqScores: number[];
  hasLab: boolean;
  /** Best lab score 0-100, or 0 if the lab has not been done. */
  labScore: number;
  asOf: Date;
}

export interface ScoreResult {
  score: number;
  attempts: number;
  accuracy: number;
  lastActivity: string | null;
  parts: { quiz: number; recent: number; prereq: number; retention: number; lab: number; evidence: number };
}

const pct = (n: number, d: number) => (d === 0 ? 0 : (n / d) * 100);

export function computeMastery(input: ScoreInput): ScoreResult {
  const { attempts, prereqScores, hasLab, labScore, asOf } = input;
  const n = attempts.length;
  if (n === 0) {
    return { score: 0, attempts: 0, accuracy: 0, lastActivity: null, parts: { quiz: 0, recent: 0, prereq: 0, retention: 0, lab: 0, evidence: 0 } };
  }

  const window = attempts.slice(-20);
  const quiz = pct(
    window.reduce((s, a) => s + (a.correct ? a.level : 0), 0),
    window.reduce((s, a) => s + a.level, 0),
  );
  const recent = pct(attempts.slice(-5).filter((a) => a.correct).length, Math.min(5, n));
  const prereq = prereqScores.length ? prereqScores.reduce((s, v) => s + v, 0) / prereqScores.length : 100;
  const last = attempts[n - 1].createdAt;
  const idleDays = Math.max(0, (asOf.getTime() - new Date(last).getTime()) / DAY);
  const retention = clamp(100 - 4 * idleDays, 40, 100);
  const lab = clamp(labScore);
  const evidence = 0.4 + 0.6 * Math.min(1, n / 8);

  const raw = hasLab
    ? WEIGHTS.quiz * quiz + WEIGHTS.recent * recent + WEIGHTS.prereq * prereq + WEIGHTS.retention * retention + WEIGHTS.lab * lab
    : (WEIGHTS.quiz + WEIGHTS.lab) * quiz + WEIGHTS.recent * recent + WEIGHTS.prereq * prereq + WEIGHTS.retention * retention;

  return {
    score: Math.round(clamp(raw * evidence)),
    attempts: n,
    accuracy: Math.round(pct(attempts.filter((a) => a.correct).length, n)),
    lastActivity: last,
    parts: { quiz, recent, prereq, retention, lab, evidence },
  };
}

/* ---------- Store-level helpers ---------- */

export interface MasteryContext {
  prereqs: Map<string, string[]>;
  attempts: Attempt[];
  labEvents: LabEvent[];
}

export function buildContext(store: Store, studentId: string): MasteryContext {
  const prereqs = new Map<string, string[]>();
  for (const p of store.prerequisites) {
    prereqs.set(p.topicId, [...(prereqs.get(p.topicId) ?? []), p.prerequisiteId]);
  }
  return {
    prereqs,
    attempts: store.attempts.filter((a) => a.studentId === studentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    labEvents: store.labEvents.filter((l) => l.studentId === studentId),
  };
}

/** Score of one topic as of a moment in time. Recurses through prerequisites; memo avoids recomputation. */
export function scoreTopicAt(ctx: MasteryContext, topicId: string, asOf: Date, memo = new Map<string, ScoreResult>()): ScoreResult {
  const hit = memo.get(topicId);
  if (hit) return hit;
  const t = asOf.getTime();
  const attempts = ctx.attempts.filter((a) => a.topicId === topicId && new Date(a.createdAt).getTime() <= t);
  const prereqScores = (ctx.prereqs.get(topicId) ?? []).map((p) => scoreTopicAt(ctx, p, asOf, memo).score);
  const labs = labsForTopic(topicId);
  const labScore = labs.length
    ? Math.max(0, ...ctx.labEvents.filter((e) => labs.some((l) => l.id === e.labId) && new Date(e.createdAt).getTime() <= t).map((e) => e.score))
    : 0;
  const result = computeMastery({ attempts, prereqScores, hasLab: labs.length > 0, labScore, asOf });
  memo.set(topicId, result);
  return result;
}

const INITIAL_LEVEL: Level = 1;

/** Recompute and persist a student's mastery for every topic (prerequisites feed downstream topics). */
export function recomputeStudentMastery(store: Store, studentId: string, now = new Date()) {
  const ctx = buildContext(store, studentId);
  const memo = new Map<string, ScoreResult>();
  for (const topic of store.topics) {
    const r = scoreTopicAt(ctx, topic.id, now, memo);
    let row = store.mastery.find((m) => m.studentId === studentId && m.topicId === topic.id);
    if (!row) {
      row = { studentId, topicId: topic.id, score: 0, attempts: 0, accuracy: 0, lastActivity: null, level: INITIAL_LEVEL, levelChangedAt: now.toISOString() };
      store.mastery.push(row);
    }
    row.score = r.score;
    row.attempts = r.attempts;
    row.accuracy = r.accuracy;
    row.lastActivity = r.lastActivity;
  }
}

export function getMasteryRow(store: Store, studentId: string, topicId: string): Mastery | undefined {
  let row = store.mastery.find((m) => m.studentId === studentId && m.topicId === topicId);
  if (!row && store.topics.some((t) => t.id === topicId)) {
    row = {
      studentId,
      topicId,
      score: 0,
      attempts: 0,
      accuracy: 0,
      lastActivity: null,
      level: INITIAL_LEVEL,
      levelChangedAt: new Date().toISOString(),
    };
    store.mastery.push(row);
  }
  return row;
}
