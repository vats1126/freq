import { fail, ok } from "@/lib/api";
import { getStudentUser } from "@/lib/auth";
import { mutate } from "@/lib/db";
import { getStudentProfile } from "@/lib/repo";
import type { Interest, LearningPreference } from "@/lib/types";

export const dynamic = "force-dynamic";

const INTERESTS: Interest[] = ["space", "sports", "gaming", "animals", "technology", "environment", "art"];
const PREFS: LearningPreference[] = ["visual", "practice-first", "explanation-first", "interactive"];

export async function GET() {
  const user = await getStudentUser();
  if (!user) return fail("Not signed in as a student", 401);
  return ok({ user, profile: getStudentProfile(user.id) });
}

export async function PATCH(request: Request) {
  const user = await getStudentUser();
  if (!user) return fail("Not signed in as a student", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail("Invalid request body");

  const patch: { name?: string; grade?: number; school?: string; interests?: Interest[]; learningPreference?: LearningPreference | null; onboarded?: boolean } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 60) return fail("Please enter your name (2 to 60 characters).");
    patch.name = name;
  }
  if (body.grade !== undefined) {
    const grade = Number(body.grade);
    if (!Number.isInteger(grade) || grade < 5 || grade > 12) return fail("Grade must be between 5 and 12.");
    patch.grade = grade;
  }
  if (body.school !== undefined) patch.school = String(body.school).trim().slice(0, 80);
  if (body.interests !== undefined) {
    if (!Array.isArray(body.interests) || body.interests.some((i) => !INTERESTS.includes(i as Interest))) return fail("Unknown interest.");
    patch.interests = [...new Set(body.interests as Interest[])];
  }
  if (body.learningPreference !== undefined) {
    if (body.learningPreference !== null && !PREFS.includes(body.learningPreference as LearningPreference)) return fail("Unknown learning preference.");
    patch.learningPreference = body.learningPreference as LearningPreference | null;
  }
  if (body.onboarded !== undefined) patch.onboarded = !!body.onboarded;

  const result = mutate((s) => {
    let u = s.users.find((x) => x.id === user.id);
    if (!u) {
      u = { id: user.id, name: user.name, email: user.email, role: "student", grade: 9, createdAt: new Date().toISOString() };
      s.users.push(u);
    }
    let p = s.studentProfiles.find((x) => x.studentId === user.id);
    if (!p) {
      p = {
        studentId: user.id,
        onboarded: false,
        learningPace: 70,
        confidence: 70,
        engagement: 70,
        interests: [],
        classId: "class-9a",
      };
      s.studentProfiles.push(p);
    }
    let interests = patch.interests ?? p.interests;
    if (patch.onboarded && interests.length === 0) {
      interests = ["technology"];
      p.interests = interests;
    }
    if (patch.name !== undefined) u.name = patch.name;
    if (patch.grade !== undefined) u.grade = patch.grade;
    if (patch.school !== undefined) u.school = patch.school || undefined;
    if (patch.interests) p.interests = patch.interests;
    if (patch.learningPreference !== undefined) p.learningPreference = patch.learningPreference ?? undefined;
    if (patch.onboarded !== undefined) p.onboarded = patch.onboarded;
    return { user: u, profile: p };
  });
  return ok(result);
}
