"use client";

import { ChevronDown, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { INTEREST_OPTIONS } from "@/components/student/interests";
import type { RethemeResult, ThemeSourceKind } from "@/lib/ai/types";
import type { Interest } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GuardrailList } from "./GuardrailList";
import { QuantityText } from "./QuantityText";
import { requestRetheme } from "./rethemeClient";
import { SourceBadge } from "./SourceBadge";

export type ThemeChoice = Interest | "original";
export interface ThemeInfo { interest: Interest; source: ThemeSourceKind }

interface Props {
  questionId: string;
  originalStem: string;
  interests: Interest[];
  /** Tells the parent which wording the student is looking at. */
  onResolved?: (info: ThemeInfo | null) => void;
  /** True while the themed wording is being fetched, so the parent can hold off on answer controls. */
  onBusyChange?: (busy: boolean) => void;
  /** The exact text currently on screen (themed or original) — e.g. so a tutor can refer to it naturally. */
  onStemText?: (text: string) => void;
}

const STORAGE_KEY = "aura-theme-choice";
const WAIT_MS = 4500;

function readChoice(interests: Interest[]): ThemeChoice {
  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY);
    if (saved === "original" || (saved && interests.includes(saved as Interest))) return saved as ThemeChoice;
  } catch { /* storage unavailable */ }
  return interests[0] ?? "original";
}

type Phase = "loading" | "ready" | "error";

/**
 * The question text, re-themed around the student's interest.
 * It shows a loading state while theming, a clear message if it can't, and always ends up with a readable question:
 * the original is what you see whenever theming is unavailable, slow, or switched off.
 */
export function ThemedStem({ questionId, originalStem, interests, onResolved, onBusyChange, onStemText }: Props) {
  const [choice, setChoice] = useState<ThemeChoice>(interests[0] ?? "original");
  const [phase, setPhase] = useState<Phase>(interests.length ? "loading" : "ready");
  const [result, setResult] = useState<RethemeResult | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const cache = useRef(new Map<string, RethemeResult>());
  const ticket = useRef(0);

  // Pick up the saved choice after mount (sessionStorage is not available during server render).
  useEffect(() => { setChoice(readChoice(interests)); }, [interests]);

  const load = useCallback(async (c: ThemeChoice) => {
    const id = ++ticket.current;
    if (c === "original") {
      setResult(null); setPhase("ready"); setError(""); onResolved?.(null);
      return;
    }
    const hit = cache.current.get(`${questionId}:${c}`);
    if (hit) { setResult(hit); setPhase("ready"); setError(""); onResolved?.({ interest: c, source: hit.source }); return; }
    setPhase("loading"); setError(""); onBusyChange?.(true);
    try {
      const r = await requestRetheme({ questionId, interest: c }, { timeoutMs: WAIT_MS });
      if (id !== ticket.current) return; // a newer request replaced this one
      cache.current.set(`${questionId}:${c}`, r);
      setResult(r); setPhase("ready"); onBusyChange?.(false); onResolved?.({ interest: c, source: r.source });
    } catch (e) {
      if (id !== ticket.current) return;
      setResult(null); setPhase("error"); onBusyChange?.(false); onResolved?.(null);
      setError(e instanceof DOMException && e.name === "AbortError" ? "Theming took too long." : "Couldn't theme this question.");
    }
  }, [questionId, onResolved, onBusyChange]);

  // If this component goes away mid-request, never leave the parent waiting.
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  useEffect(() => { void load(choice); }, [choice, load]);

  function pick(c: ThemeChoice) {
    try { window.sessionStorage.setItem(STORAGE_KEY, c); } catch { /* fine */ }
    setChoice(c);
  }

  const showingOriginal = phase !== "ready" || !result || !result.themed;
  const text = phase === "ready" && result ? result.stem : originalStem;
  // If the pipeline ran but produced text identical to the original (nothing to theme, or the
  // model just echoed it back), the badge must say "Original" too — not "AI-themed" with nothing changed.
  const source: ThemeSourceKind = phase === "ready" && result && result.themed ? result.source : "original";

  useEffect(() => { if (phase === "ready") onStemText?.(text); }, [phase, text, onStemText]);

  return (
    <div>
      {interests.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Question theme">
          {interests.map((id) => {
            const meta = INTEREST_OPTIONS.find((o) => o.id === id);
            if (!meta) return null;
            const Icon = meta.icon;
            const on = choice === id;
            return (
              <button key={id} type="button" aria-pressed={on} onClick={() => pick(id)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition active:scale-95", on ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:border-brand/40 hover:text-ink")}>
                <Icon className="size-3.5" aria-hidden /> {meta.label}
              </button>
            );
          })}
          <button type="button" aria-pressed={choice === "original"} onClick={() => pick("original")} className={cn("inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition active:scale-95", choice === "original" ? "border-ink bg-subtle text-ink" : "border-line text-muted hover:border-brand/40 hover:text-ink")}>
            Original
          </button>
        </div>
      )}

      <div aria-live="polite" aria-busy={phase === "loading"}>
        {phase === "loading" ? (
          <div role="status" className="space-y-3">
            <div className="relative h-7 overflow-hidden rounded-lg bg-subtle"><div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-surface/70 to-transparent" /></div>
            <div className="relative h-7 w-2/3 overflow-hidden rounded-lg bg-subtle"><div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-surface/70 to-transparent" /></div>
            <p className="flex items-center gap-2 text-xs text-muted"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Theming this question…</p>
          </div>
        ) : (
          <p data-question-id={questionId} data-source={source} className="text-xl font-medium leading-snug tracking-tight sm:text-2xl">
            {source === "original" ? text : <QuantityText text={text} />}
          </p>
        )}
      </div>

      {phase === "error" && (
        <p role="alert" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm">
          <span>{error} Showing the original question.</span>
          <button type="button" onClick={() => void load(choice)} className="inline-flex items-center gap-1 font-semibold text-brand"><RotateCcw className="size-3.5" aria-hidden /> Try again</button>
        </p>
      )}

      {phase === "ready" && result && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={source} />
            {result.themed ? (
              <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-subtle hover:text-ink">
                <ShieldCheck className="size-3.5 text-success" aria-hidden /> Same question, new story
                <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} aria-hidden />
              </button>
            ) : (
              <span className="text-xs text-muted">{showingOriginal ? "No theme for this question, so here it is as written." : ""}</span>
            )}
          </div>
          {open && result.themed && (
            <div className="mt-3 rounded-2xl border border-line bg-subtle/60 p-4">
              <p className="mb-3 text-sm">Only the story changed. The numbers ({result.preserved.numbers.join(", ")}), units, what's being asked, the answer and the difficulty are exactly the same as the original.</p>
              <GuardrailList result={result} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
