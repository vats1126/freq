"use client";

import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/utils";
import type { Interest, LearningPreference } from "@/lib/types";
import { INTEREST_OPTIONS, interestLabel, PREFERENCE_OPTIONS } from "./interests";

interface Initial {
  name: string;
  grade: number;
  school: string;
  interests: Interest[];
  preference: LearningPreference | null;
}

const GRADES = [6, 7, 8, 9, 10, 11, 12];
const STEPS = ["About you", "Interests", "Learning style"];

const BUILD_STEPS = (interests: Interest[]) => [
  "Mapping the topics and what each one builds on",
  "Checking what you already know",
  `Choosing examples from ${interests.length ? interestLabel(interests[0]) : "your world"}`,
  "Your learning path is ready",
];

export function OnboardingFlow({ initial, editMode }: { initial: Initial; editMode: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial.name);
  const [grade, setGrade] = useState(initial.grade);
  const [school, setSchool] = useState(initial.school);
  const [interests, setInterests] = useState<Interest[]>(initial.interests);
  const [preference, setPreference] = useState<LearningPreference | null>(initial.preference);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(-1);

  const nameError = name.trim().length < 2 ? "Please tell us your name." : undefined;
  const canNext = step === 0 ? !nameError : step === 1 ? interests.length > 0 : true;

  useEffect(() => {
    if (building < 0) return;
    if (building >= BUILD_STEPS(interests).length) {
      const t = window.setTimeout(() => {
        window.location.href = editMode ? "/student/profile" : "/student/learn";
      }, 700);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setBuilding((b) => b + 1), 650);
    return () => window.clearTimeout(t);
  }, [building, interests, editMode]);

  async function skipToLearning() {
    setSaving(true);
    setError(null);
    try {
      const chosenInterests = interests.length > 0 ? interests : ["technology" as Interest];
      const res = await fetch("/api/student/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || initial.name,
          grade,
          school: school.trim(),
          interests: chosenInterests,
          learningPreference: preference,
          onboarded: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Couldn't save your choices.");
      window.location.href = "/student/learn";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  async function finish() {
  setSaving(true);
  setError(null);

  try {
    const res = await fetch("/api/student/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        grade,
        school: school.trim(),
        interests,
        learningPreference: preference,
        onboarded: true,
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error ?? "Couldn't save your choices.");
    }

    setBuilding(0);
  } catch (e) {
    setError(
      e instanceof Error
        ? e.message
        : "Something went wrong. Please try again."
    );
    setSaving(false);
  }
}

  function toggleInterest(id: Interest) {
    setInterests((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  if (building >= 0) {
    const items = BUILD_STEPS(interests);
    return (
      <div className="enter mx-auto w-full max-w-md py-10 text-center">
        <div className="relative mx-auto mb-8 grid size-24 place-items-center">
          <span className="absolute inset-0 animate-aura-pulse rounded-full border border-brand/30" />
          <span className="absolute inset-3 animate-aura-pulse rounded-full border border-accent/40 [animation-delay:-2s]" />
          <span className="grid size-12 place-items-center rounded-full bg-brand text-brand-on">
            {building >= items.length ? <Check className="size-6" /> : <Loader2 className="size-6 animate-spin" />}
          </span>
        </div>
        <h1 className="t-title">Building your path</h1>
        <ul className="mt-8 space-y-3 text-left">
          {items.map((label, i) => {
            const done = i < building;
            const active = i === building;
            return (
              <li key={label} className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3 transition duration-300", done ? "border-success/30 bg-success-soft" : active ? "border-brand/30 bg-brand-soft" : "border-line opacity-40")}>
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", done ? "bg-success text-brand-on" : "border border-line")}>
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : active ? <Loader2 className="size-3.5 animate-spin text-brand" /> : null}
                </span>
                <span className="text-sm font-medium">{label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-medium">{STEPS[step]}</span>
          <div className="flex items-center gap-3">
            <span className="text-muted">Step {step + 1} of {STEPS.length}</span>
            {!editMode && (
              <button
                type="button"
                onClick={skipToLearning}
                disabled={saving}
                className="text-xs font-semibold text-brand underline-offset-4 hover:underline"
              >
                Skip to Learn &rarr;
              </button>
            )}
          </div>
        </div>
        <ProgressBar value={((step + 1) / STEPS.length) * 100} label={`Step ${step + 1} of ${STEPS.length}`} />
      </div>

      <div key={step} className="enter">
        {step === 0 && (
          <section>
            <h1 className="t-title">{editMode ? "Update your details" : "Let's get to know you"}</h1>
            <p className="t-body mt-2">Just the basics, so AURA can build your path.</p>
            <div className="mt-8 space-y-6">
              <Input label="What should we call you?" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="given-name" error={name.length > 0 ? nameError : undefined} />
              <div>
                <p className="mb-2 text-sm font-medium">Which grade are you in?</p>
                <div role="radiogroup" aria-label="Grade" className="flex flex-wrap gap-2">
                  {GRADES.map((g) => (
                    <button key={g} type="button" role="radio" aria-checked={grade === g} onClick={() => setGrade(g)} className={cn("h-12 min-w-14 rounded-xl border px-4 font-medium transition active:scale-95", grade === g ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface hover:border-brand/40")}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <Input label="School" required={false} value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Your school" autoComplete="organization" />
            </div>
          </section>
        )}

        {step === 1 && (
          <section>
            <h1 className="t-title">What are you into?</h1>
            <p className="t-body mt-2">Pick as many as you like. AURA uses these to choose examples and recommendations.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2" role="group" aria-label="Interests">
              {INTEREST_OPTIONS.map(({ id, label, icon: Icon }) => (
                <Chip key={id} selected={interests.includes(id)} onToggle={() => toggleInterest(id)} icon={<Icon className="size-5" />}>
                  {label}
                </Chip>
              ))}
            </div>
            {interests.length === 0 && <p className="mt-4 text-sm text-muted">Choose at least one to continue.</p>}
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 className="t-title">How do you like to learn?</h1>
            <p className="t-body mt-2">Optional. AURA will lead with what suits you, and you can always change it.</p>
            <div role="radiogroup" aria-label="Learning style" className="mt-8 grid gap-3 sm:grid-cols-2">
              {PREFERENCE_OPTIONS.map(({ id, label, blurb, icon: Icon }) => {
                const selected = preference === id;
                return (
                  <button key={id} type="button" role="radio" aria-checked={selected} onClick={() => setPreference(selected ? null : id)} className={cn("flex items-start gap-3 rounded-2xl border p-4 text-left transition active:scale-[0.98]", selected ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-brand/40")}>
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", selected ? "bg-brand text-brand-on" : "bg-subtle text-muted")}>
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span>
                      <span className={cn("block font-semibold", selected && "text-brand")}>{label}</span>
                      <span className="t-small mt-0.5 block">{blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {error && <p role="alert" className="mt-6 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="mt-10 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || saving} iconLeft={<ArrowLeft className="size-4" />} className={cn(step === 0 && "invisible")}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          {!editMode && (
            <Button variant="ghost" onClick={skipToLearning} disabled={saving} size="lg">
              Skip for now
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext} iconRight={<ArrowRight className="size-4" />} size="lg">
              Continue
            </Button>
          ) : (
            <Button onClick={finish} loading={saving} size="lg" iconRight={<ArrowRight className="size-4" />}>
              {editMode ? "Save changes" : "Build my path"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
