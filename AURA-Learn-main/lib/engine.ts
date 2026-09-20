import { labsForTopic } from "@/content/labs";
import { decideLevel, describeWindow, type LevelChange, type LevelDecision, type LevelWindowView } from "./adaptive";
import {
  buildPrereqMap, buildUnlockMap, checkPrerequisites, MASTERED_THRESHOLD, newlyUnlocked, prerequisitesOf, UNLOCK_THRESHOLD,
  type PrereqRef, type PrerequisiteCheck,
} from "./curriculum";
import { eventsFor, recordEvent } from "./events";
import { activeInterventionFor, evaluateIntervention, type InterventionOutcome } from "./intervention";
import { bandOf, buildContext, getMasteryRow, recomputeStudentMastery, scoreTopicAt, type MasteryBand, type ScoreResult } from "./mastery";
import { computeStruggle, type StruggleResult } from "./struggle";
import { trackingStats, type TrackingStats } from "./tracking";
import type { AdaptiveEvent, Attempt, Intervention, Level, Store } from "./types";

/**
 * The adaptive engine's orchestration layer. It does no maths of its own: it calls the pure services
 * (mastery, adaptive, struggle, curriculum, intervention) in a fixed order after every learning event.
 *
 *   attempt saved -> mastery recomputed -> difficulty adapted -> struggle scored
 *   -> prerequisites checked -> intervention evaluated -> unlocks computed -> events logged
 */

export function topicAttempts(store: Store, studentId: string, topicId: string): Attempt[] {
  return store.attempts
    .filter((a) => a.studentId === studentId && a.topicId === topicId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function scoreMap(store: Store, studentId: string): Map<string, number> {
  return new Map(store.mastery.filter((m) => m.studentId === studentId).map((m) => [m.topicId, m.score]));
}

function nameMap(store: Store): Map<string, string> {
  return new Map(store.topics.map((t) => [t.id, t.name]));
}

export function prereqRefsFor(store: Store, studentId: string, topicId: string): PrereqRef[] {
  return prerequisitesOf(topicId, buildPrereqMap(store.prerequisites), scoreMap(store, studentId), nameMap(store));
}

/** Topics whose prerequisites are not all at 60+, computed from the persisted mastery. */
export function lockedTopics(store: Store, studentId: string): Set<string> {
  const prereqs = buildPrereqMap(store.prerequisites);
  const scores = scoreMap(store, studentId);
  const names = nameMap(store);
  return new Set(store.topics.filter((t) => prerequisitesOf(t.id, prereqs, scores, names).some((p) => !p.ok)).map((t) => t.id));
}

export function masteredTopics(store: Store, studentId: string): Set<string> {
  return new Set(store.mastery.filter((m) => m.studentId === studentId && m.score >= MASTERED_THRESHOLD).map((m) => m.topicId));
}

export function struggleFor(store: Store, studentId: string, topicId: string): StruggleResult {
  return computeStruggle({ attempts: topicAttempts(store, studentId, topicId), prereqs: prereqRefsFor(store, studentId, topicId) });
}

/** The topics a struggling topic is holding back: dependants that are currently locked. */
function blockedDependants(store: Store, studentId: string, topicId: string) {
  const locked = lockedTopics(store, studentId);
  const names = nameMap(store);
  const next = (buildUnlockMap(store.prerequisites).get(topicId) ?? []).find((id) => locked.has(id));
  return next ? { id: next, name: names.get(next) ?? next } : undefined;
}

export interface EngineSnapshot {
  score: number;
  level: Level;
  locked: Set<string>;
  mastered: Set<string>;
  struggle: StruggleResult;
}

/** State to capture BEFORE an event is applied, so the cycle can report what changed. */
export function snapshot(store: Store, studentId: string, topicId: string): EngineSnapshot {
  const row = getMasteryRow(store, studentId, topicId);
  return { score: row?.score ?? 0, level: row?.level ?? 1, locked: lockedTopics(store, studentId), mastered: masteredTopics(store, studentId), struggle: struggleFor(store, studentId, topicId) };
}

export interface CycleResult {
  mastery: { before: number; after: number; band: MasteryBand };
  level: LevelDecision & { before: Level; after: Level };
  struggle: { before: StruggleResult; after: StruggleResult };
  prerequisiteCheck: PrerequisiteCheck | null;
  intervention: InterventionOutcome;
  unlocked: { id: string; name: string }[];
  mastered: { id: string; name: string }[];
  events: AdaptiveEvent[];
}

/**
 * Run the full adaptive cycle for one learning event on one topic. Mutates the store.
 * `trigger` is "attempt" (a question was answered, so difficulty may adapt) or "lab" (mastery changed but no question).
 */
export function runAdaptiveCycle(store: Store, studentId: string, topicId: string, before: EngineSnapshot, now: Date, trigger: "attempt" | "lab"): CycleResult {
  const logStart = store.events.length;
  const names = nameMap(store);
  const topicName = names.get(topicId) ?? topicId;

  // 1. Mastery
  recomputeStudentMastery(store, studentId, now);
  const row = getMasteryRow(store, studentId, topicId)!;

  // 2. Difficulty adaptation (only a new answer can change the level)
  let decision: LevelDecision = { level: row.level, change: "hold", checkPrerequisites: false, reason: "" };
  const levelBefore = row.level;
  if (trigger === "attempt") {
    const windowAttempts = topicAttempts(store, studentId, topicId).filter((a) => a.createdAt > row.levelChangedAt);
    decision = decideLevel(row.level, windowAttempts);
    if (decision.change !== "hold") {
      row.level = decision.level;
      row.levelChangedAt = now.toISOString();
      recordEvent(store, {
        studentId, topicId, type: "level", tone: decision.change === "up" ? "good" : "info",
        title: decision.change === "up" ? `Level up in ${topicName}: Level ${decision.level}` : `Difficulty eased in ${topicName}: Level ${decision.level}`,
        detail: decision.reason,
      }, now);
    }
  }

  // 3. Struggle
  const prereqs = prereqRefsFor(store, studentId, topicId);
  const struggleAfter = computeStruggle({ attempts: topicAttempts(store, studentId, topicId), prereqs });
  if (before.struggle.level === "normal" && struggleAfter.level === "watch") {
    recordEvent(store, { studentId, topicId, type: "struggle", tone: "warn", title: `AURA is keeping an eye on ${topicName}`, detail: `Struggle score rose to ${struggleAfter.score}.` }, now);
  } else if (struggleAfter.level === "normal" && before.struggle.level !== "normal") {
    recordEvent(store, { studentId, topicId, type: "struggle", tone: "good", title: `Struggle eased in ${topicName}`, detail: `Struggle score dropped to ${struggleAfter.score}.` }, now);
  }

  // 4. Prerequisite check: whenever difficulty is lowered, or the student is struggling
  const wantsCheck = decision.checkPrerequisites || struggleAfter.level === "intervention" || struggleAfter.level === "immediate";
  const prerequisiteCheck = wantsCheck ? checkPrerequisites(topicName, prereqs) : null;
  // Log the check once per situation, not on every miss: skip if the same finding was logged in the last 30 minutes.
  const alreadyLogged = store.events.some(
    (e) => e.studentId === studentId && e.topicId === topicId && e.type === "prerequisite" && e.detail === prerequisiteCheck?.message && now.getTime() - new Date(e.at).getTime() < 30 * 60_000,
  );
  if (decision.checkPrerequisites && prerequisiteCheck && !alreadyLogged) {
    recordEvent(store, { studentId, topicId, type: "prerequisite", tone: prerequisiteCheck.solid ? "info" : "warn", title: `Prerequisite check for ${topicName}`, detail: prerequisiteCheck.message }, now);
  }

  // 5. Intervention (uses the check even when no level change asked for one)
  const check = prerequisiteCheck ?? checkPrerequisites(topicName, prereqs);
  const intervention = evaluateIntervention(
    store, studentId,
    { topicId, topicName, struggle: struggleAfter, prereqCheck: check, blocks: blockedDependants(store, studentId, topicId), attempts: topicAttempts(store, studentId, topicId) },
    now,
  );

  // 6. Unlocking and mastery milestones
  const lockedAfter = lockedTopics(store, studentId);
  const unlockedIds = newlyUnlocked(
    store.topics.map((t) => ({ id: t.id, locked: before.locked.has(t.id) })),
    store.topics.map((t) => ({ id: t.id, locked: lockedAfter.has(t.id) })),
  );
  const unlocked = unlockedIds.map((id) => ({ id, name: names.get(id) ?? id }));
  for (const u of unlocked) {
    recordEvent(store, { studentId, topicId: u.id, type: "unlock", tone: "good", title: `${u.name} unlocked`, detail: `${topicName} reached ${row.score}%, above the ${UNLOCK_THRESHOLD}% needed.` }, now);
  }
  const masteredNow = [...masteredTopics(store, studentId)].filter((id) => !before.mastered.has(id)).map((id) => ({ id, name: names.get(id) ?? id }));
  for (const m of masteredNow) {
    recordEvent(store, { studentId, topicId: m.id, type: "mastered", tone: "good", title: `${m.name} mastered`, detail: "Mastery reached 80% or more." }, now);
  }

  return {
    mastery: { before: before.score, after: row.score, band: bandOf(row.score) },
    level: { ...decision, before: levelBefore, after: row.level },
    struggle: { before: before.struggle, after: struggleAfter },
    prerequisiteCheck,
    intervention,
    unlocked,
    mastered: masteredNow,
    events: store.events.slice(logStart),
  };
}

/* ================= Read model for the "Insights" view ================= */

export interface TopicEngine {
  topicId: string;
  topicName: string;
  mastery: ScoreResult & { band: MasteryBand };
  level: { current: Level; window: LevelWindowView; change: LevelChange };
  struggle: StruggleResult;
  tracking: TrackingStats;
  prerequisites: PrereqRef[];
  prerequisiteCheck: PrerequisiteCheck;
  unlock: { locked: boolean; threshold: number; blockedBy: PrereqRef[]; unlocks: { id: string; name: string; locked: boolean }[] };
  intervention: Intervention | null;
  events: AdaptiveEvent[];
  labIds: string[];
}

export function getTopicEngine(store: Store, studentId: string, topicId: string, now = new Date()): TopicEngine | null {
  const topic = store.topics.find((t) => t.id === topicId);
  if (!topic) return null;
  let row = getMasteryRow(store, studentId, topicId);
  if (!row) {
    row = {
      studentId,
      topicId,
      score: 0,
      attempts: 0,
      accuracy: 0,
      lastActivity: null,
      level: 1,
      levelChangedAt: now.toISOString(),
    };
    store.mastery.push(row);
  }
  const ctx = buildContext(store, studentId);
  const score = scoreTopicAt(ctx, topicId, now);
  const attempts = topicAttempts(store, studentId, topicId);
  const prereqs = prereqRefsFor(store, studentId, topicId);
  const locked = lockedTopics(store, studentId);
  const windowAttempts = attempts.filter((a) => a.createdAt > row.levelChangedAt);
  return {
    topicId, topicName: topic.name,
    mastery: { ...score, band: bandOf(score.score) },
    level: { current: row.level, window: describeWindow(row.level, windowAttempts), change: "hold" },
    struggle: computeStruggle({ attempts, prereqs }),
    tracking: trackingStats(attempts.slice(-10)),
    prerequisites: prereqs,
    prerequisiteCheck: checkPrerequisites(topic.name, prereqs),
    unlock: {
      locked: locked.has(topicId), threshold: UNLOCK_THRESHOLD, blockedBy: prereqs.filter((p) => !p.ok),
      unlocks: (buildUnlockMap(store.prerequisites).get(topicId) ?? []).map((id) => ({ id, name: nameMap(store).get(id) ?? id, locked: locked.has(id) })),
    },
    intervention: activeInterventionFor(store, studentId, topicId) ?? null,
    events: eventsFor(store, studentId, { topicId, limit: 12 }),
    labIds: labsForTopic(topicId).map((l) => l.id),
  };
}
