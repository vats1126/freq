import { describe, expect, it } from "vitest";
import { buildSeed } from "./seed";

describe("seed data", () => {
  const s = buildSeed();

  it("has both roles and demo accounts for each", () => {
    const demo = s.users.filter((u) => u.demo);
    expect(demo.map((u) => u.role).sort()).toEqual(["facilitator", "student"]);
  });

  it("has a valid, acyclic prerequisite graph", () => {
    const ids = new Set(s.topics.map((t) => t.id));
    for (const p of s.prerequisites) {
      expect(ids.has(p.topicId)).toBe(true);
      expect(ids.has(p.prerequisiteId)).toBe(true);
    }
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string) => {
      if (done.has(id)) return;
      if (visiting.has(id)) throw new Error(`cycle at ${id}`);
      visiting.add(id);
      s.prerequisites.filter((p) => p.topicId === id).forEach((p) => visit(p.prerequisiteId));
      visiting.delete(id);
      done.add(id);
    };
    expect(() => ids.forEach(visit)).not.toThrow();
  });

  it("starts Aarav with a weak Resistance prerequisite", () => {
    const score = (t: string) => s.mastery.find((m) => m.studentId === "u-aarav" && m.topicId === t)?.score;
    expect(score("electric-current")).toBeGreaterThanOrEqual(80);
    expect(score("voltage")).toBeGreaterThanOrEqual(80);
    expect(score("resistance")).toBeLessThan(60);
    expect(score("ohms-law")).toBe(0);
  });

  it("ensures all seeded students have valid mastery records for all topics", () => {
    const studentUsers = s.users.filter((u) => u.role === "student");
    expect(studentUsers.length).toBeGreaterThan(1);
    for (const student of studentUsers) {
      const studentMastery = s.mastery.filter((m) => m.studentId === student.id);
      expect(studentMastery).toHaveLength(s.topics.length);
      for (const t of s.topics) {
        const row = studentMastery.find((m) => m.topicId === t.id);
        expect(row).toBeDefined();
        expect(typeof row?.score).toBe("number");
        expect(typeof row?.level).toBe("number");
      }
    }
  });
});

describe("data integrity & facilitator operational readiness", () => {
  it("ensureAccountInStore initializes profile and all topic mastery rows for new students", async () => {
    const { ensureAccountInStore } = await import("./repo");
    const testStore = buildSeed();
    const newStudent = { id: "u-newbie", name: "Newbie Student", email: "newbie@aura.demo", role: "student" as const };
    const user = ensureAccountInStore(testStore, newStudent);
    expect(user.id).toBe("u-newbie");
    expect(testStore.users.some((u) => u.id === "u-newbie")).toBe(true);
    expect(testStore.studentProfiles.some((p) => p.studentId === "u-newbie")).toBe(true);
    const masteryRows = testStore.mastery.filter((m) => m.studentId === "u-newbie");
    expect(masteryRows).toHaveLength(testStore.topics.length);
    for (const row of masteryRows) {
      expect(row.score).toBe(0);
      expect(row.level).toBe(1);
    }
  });

  it("facilitator overview, student roster, and all student detail views operate cleanly for all seeded students", async () => {
    const { facilitatorOverview, interventionQueue, studentsOverview, studentDetail } = await import("./facilitator");
    const testStore = buildSeed();
    const overview = facilitatorOverview(testStore);
    expect(typeof overview.studentsNeedingAttention).toBe("number");
    expect(typeof overview.activeInterventions).toBe("number");

    const queue = interventionQueue(testStore);
    expect(Array.isArray(queue)).toBe(true);

    const roster = studentsOverview(testStore);
    const studentUsers = testStore.users.filter((u) => u.role === "student");
    expect(roster).toHaveLength(studentUsers.length);

    for (const student of studentUsers) {
      const detail = studentDetail(testStore, student.id);
      expect(detail.state.student.id).toBe(student.id);
      expect(detail.state.topics).toHaveLength(testStore.topics.length);
      expect(detail.state.courses).toHaveLength(testStore.subjects.length);
      expect(Array.isArray(detail.insights.strengths)).toBe(true);
      expect(Array.isArray(detail.insights.attention)).toBe(true);
      expect(Array.isArray(detail.recommended)).toBe(true);
    }
  });
});
