import { QUESTIONS } from "@/content/questions";
import { recomputeStudentMastery } from "./mastery";
import type { Attempt, Interest, Level, Mastery, Prerequisite, Store, StudentProfile, Subject, Topic, User } from "./types";

/**
 * Deterministic demo data (PRD section 28).
 *
 * Aarav's mastery is NOT typed in. It is derived from a believable attempt history by the same
 * mastery engine that runs live, so the numbers on screen always come from real behaviour.
 * Story: strong on Current and Voltage, stuck on Resistance, so Ohm's Law is still locked.
 */

export const SEED_VERSION = 5;
const CLASS_ID = "class-9a";
const DAY = 86_400_000;

const users: User[] = [
  { id: "u-aarav", name: "Aarav Sharma", email: "aarav@aura.demo", role: "student", grade: 9, school: "Greenfield Public School", demo: true, createdAt: "2026-09-01T09:00:00.000Z" },
  { id: "u-rao", name: "Ms. Priya Rao", email: "priya.rao@aura.demo", role: "facilitator", school: "Greenfield Public School", demo: true, createdAt: "2026-09-01T09:00:00.000Z" },
  ...[
    ["u-meera", "Meera Iyer"], ["u-kabir", "Kabir Singh"], ["u-ananya", "Ananya Das"], ["u-rohan", "Rohan Mehta"],
    ["u-ishaan", "Ishaan Verma"], ["u-sara", "Sara Khan"], ["u-dev", "Dev Patel"], ["u-tara", "Tara Nair"],
  ].map(([id, name]): User => ({ id, name, email: `${id.slice(2)}@aura.demo`, role: "student", grade: 9, createdAt: "2026-09-01T09:00:00.000Z" })),
];

function profile(studentId: string, p: Partial<StudentProfile> = {}): StudentProfile {
  return { studentId, onboarded: true, learningPace: 70, confidence: 70, engagement: 75, interests: [] as Interest[], classId: CLASS_ID, ...p };
}

const studentProfiles: StudentProfile[] = [
  // Aarav demo student is onboarded so learners can enter learning directly.
  profile("u-aarav", { onboarded: true, learningPace: 82, confidence: 61, engagement: 89 }),
  profile("u-meera", { interests: ["art", "animals"], learningPace: 88, confidence: 84 }),
  profile("u-kabir", { interests: ["sports"], learningPace: 64, confidence: 55 }),
  profile("u-ananya", { interests: ["technology"], learningPace: 79, confidence: 72 }),
  profile("u-rohan", { interests: ["gaming"], learningPace: 58, confidence: 48, engagement: 52 }),
  profile("u-ishaan", { interests: ["space"], learningPace: 74, confidence: 69 }),
  profile("u-sara", { interests: ["environment"], learningPace: 91, confidence: 88 }),
  profile("u-dev", { interests: ["sports", "gaming"], learningPace: 66, confidence: 60 }),
  profile("u-tara", { interests: ["animals"], learningPace: 80, confidence: 77 }),
];

const subjects: Subject[] = [
  { id: "physics", name: "Physics", grade: 9, accent: "brand", courseTitle: "Ohm's Law", goalTopicId: "ohms-law" },
  { id: "chemistry", name: "Chemistry", grade: 9, accent: "accent", courseTitle: "Acid–Base Titration", goalTopicId: "titration" },
  { id: "biology", name: "Biology", grade: 9, accent: "success", courseTitle: "Human Senses", goalTopicId: "brain-response" },
];

const topics: Topic[] = [
  { id: "electric-current", subjectId: "physics", name: "Electric Current", description: "How charge flows through a conductor.", difficulty: 1, order: 1 },
  { id: "voltage", subjectId: "physics", name: "Voltage", description: "The push that drives current around a circuit.", difficulty: 1, order: 2 },
  { id: "resistance", subjectId: "physics", name: "Resistance", description: "How materials oppose the flow of current.", difficulty: 2, order: 3 },
  { id: "ohms-law", subjectId: "physics", name: "Ohm's Law", description: "The relationship between voltage, current and resistance.", difficulty: 3, order: 4 },

  { id: "acids-bases", subjectId: "chemistry", name: "Acids & Bases", description: "What makes a substance acidic or basic.", difficulty: 1, order: 1 },
  { id: "ph", subjectId: "chemistry", name: "pH", description: "Measuring how acidic or basic a solution is.", difficulty: 2, order: 2 },
  { id: "indicators", subjectId: "chemistry", name: "Indicators", description: "Colour changes that reveal pH.", difficulty: 2, order: 3 },
  { id: "titration", subjectId: "chemistry", name: "Acid–Base Titration", description: "Finding an unknown concentration precisely.", difficulty: 3, order: 4 },

  { id: "sense-organs", subjectId: "biology", name: "Sense Organs", description: "The body's five information gatherers.", difficulty: 1, order: 1 },
  { id: "stimulus", subjectId: "biology", name: "Stimulus", description: "What the environment sends our way.", difficulty: 1, order: 2 },
  { id: "sensory-receptors", subjectId: "biology", name: "Sensory Receptors", description: "Cells that turn stimuli into signals.", difficulty: 2, order: 3 },
  { id: "brain-response", subjectId: "biology", name: "Brain Response", description: "How the brain decides what to do next.", difficulty: 3, order: 4 },
];

/** Each subject is a chain: topic N requires topic N-1. */
const prerequisites: Prerequisite[] = [
  ["electric-current", "voltage"], ["voltage", "resistance"], ["resistance", "ohms-law"],
  ["acids-bases", "ph"], ["ph", "indicators"], ["indicators", "titration"],
  ["sense-organs", "stimulus"], ["stimulus", "sensory-receptors"], ["sensory-receptors", "brain-response"],
].map(([prereq, topic]) => ({ topicId: topic, prerequisiteId: prereq }));

/**
 * Attempt history for Aarav, written as practice sessions: "daysAgo: token token | daysAgo: ...".
 * Each token is a question level followed by + (correct) or - (wrong).
 * There is deliberately no activity 7 days ago, so his current streak is a believable 6 days.
 */
interface Plan { topicId: string; level: Level; sessions: string }
const PLANS: Plan[] = [
  { topicId: "electric-current", level: 4, sessions: "21:1+ 1+ 1+ | 20:2+ 2+ | 18:2- 2+ | 16:3+ 3+ | 15:3- 3+ | 13:4+ 4- 4+" },
  { topicId: "voltage", level: 3, sessions: "14:1+ 1+ 2+ | 13:2+ 2+ 2- | 11:3+ 3- 3+ | 8:3+ 3+ 3+" },
  { topicId: "resistance", level: 2, sessions: "9:1+ 1+ | 8:2+ 2- | 6:2+ 2+ | 3:3- 3- 3-" },
  { topicId: "acids-bases", level: 3, sessions: "20:1+ 1+ 2+ | 17:2+ 2- | 14:3+ 3+ | 12:3- 3+ 3+" },
  { topicId: "ph", level: 2, sessions: "10:1+ 1+ | 8:2+ 2- | 5:2+ 2+" },
  { topicId: "sense-organs", level: 4, sessions: "19:1+ 1+ 2+ | 16:2+ 3+ | 13:3+ 4+ 4+" },
  { topicId: "stimulus", level: 2, sessions: "11:1+ 1+ | 9:2+ 2- | 6:2+ 2+ | 4:2+" },
];
/** Short reviews on Electric Current, so days 2 and 1 are also active. */
const REVIEW_DAYS = [2, 1];

function seedAttempts(now: Date): { attempts: Attempt[]; lastByTopic: Map<string, string> } {
  const attempts: Attempt[] = [];
  const cursor = new Map<string, number>();
  let seq = 0;
  // Anchor sessions to 09:00 UTC on their day so a session never straddles midnight.
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const at = (daysAgo: number, slot: number) => new Date(dayStart - daysAgo * DAY + 9 * 3_600_000 + slot * 40 * 60_000).toISOString();

  const add = (topicId: string, level: number, correct: boolean, createdAt: string, i: number) => {
    const pool = QUESTIONS.filter((q) => q.topicId === topicId && q.level === level);
    const key = `${topicId}-${level}`;
    const idx = cursor.get(key) ?? 0;
    cursor.set(key, idx + 1);
    const q = pool[idx % pool.length];
    attempts.push({
      id: `att-seed-${++seq}`, studentId: "u-aarav", questionId: q.id, topicId, level: level as Level,
      answer: correct ? q.answer : "(seeded)", correct, skipped: false,
      timeTakenSec: correct ? 24 + ((i * 7) % 18) : 52 + ((i * 11) % 40),
      hintsUsed: correct ? (i % 6 === 0 ? 1 : 0) : i % 2, createdAt,
    });
  };

  for (const p of PLANS) {
    let i = 0;
    for (const session of p.sessions.split("|")) {
      const [day, toks] = session.split(":");
      toks.trim().split(/\s+/).forEach((tok, slot) => add(p.topicId, Number(tok[0]), tok[1] === "+", at(Number(day), slot), i++));
    }
  }
  REVIEW_DAYS.forEach((d, i) => add("electric-current", 3, true, at(d, 0), 40 + i));

  attempts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lastByTopic = new Map<string, string>();
  for (const a of attempts) lastByTopic.set(a.topicId, a.createdAt);
  return { attempts, lastByTopic };
}

const START_LEVEL: Record<string, Level> = Object.fromEntries(PLANS.map((p) => [p.topicId, p.level]));

export function buildSeed(now: Date = new Date()): Store {
  const { attempts, lastByTopic } = seedAttempts(now);
  const store: Store = {
    version: SEED_VERSION,
    users: structuredClone(users),
    studentProfiles: structuredClone(studentProfiles),
    subjects: structuredClone(subjects),
    topics: structuredClone(topics),
    prerequisites: structuredClone(prerequisites),
    questions: structuredClone(QUESTIONS),
    mastery: [],
    attempts,
    interventions: [],
    labEvents: [],
    events: [],
    serves: [],
    themeCache: [],
  };

  const rows: Mastery[] = [];
  for (const u of users) {
    if (u.role === "student") {
      for (const t of topics) {
        rows.push({
          studentId: u.id,
          topicId: t.id,
          score: 0,
          attempts: 0,
          accuracy: 0,
          lastActivity: null,
          level: u.id === "u-aarav" ? (START_LEVEL[t.id] ?? 1) : 1,
          levelChangedAt: (u.id === "u-aarav" ? lastByTopic.get(t.id) : undefined) ?? now.toISOString(),
        });
      }
    }
  }
  store.mastery = rows;
  for (const u of users) {
    if (u.role === "student") {
      recomputeStudentMastery(store, u.id, now);
    }
  }
  return store;
}
