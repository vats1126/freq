import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { labsForTopic } from "@/content/labs";
import { analogyFor, LESSONS } from "@/content/lessons";
import { TopicSideCard } from "@/components/learning/TopicSideCard";
import { TopicWorkspace, type WorkspaceTab } from "@/components/learning/TopicWorkspace";
import { StatusPill } from "@/components/ui/StatusPill";
import { requireUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { getTopicEngine } from "@/lib/engine";
import { summarizeIntervention } from "@/lib/intervention";
import { getStudentState, getTopicState } from "@/lib/student";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const t = getStore().topics.find((x) => x.id === topicId);
  return { title: t?.name ?? "Topic" };
}

export default async function TopicPage({ params, searchParams }: { params: Promise<{ topicId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser("student");
  const { topicId } = await params;
  const { tab } = await searchParams;
  const state = getStudentState(getStore(), user.id);
  const topic = getTopicState(state, topicId);
  if (!topic) notFound();

  // Locked topics are blocked here, on the server, not just visually on the path.
  if (topic.locked) redirect(`/student/path?course=${topic.subjectId}&gap=${topic.id}`);

  const course = state.courses.find((c) => c.subjectId === topic.subjectId);
  if (!course) notFound();
  const pref = state.profile.learningPreference;
  const labs = labsForTopic(topic.id).map((l) => ({ id: l.id, title: l.title, blurb: l.blurb, minutes: l.minutes, best: state.labCompleted[l.id] ?? null }));
  const initialTab: WorkspaceTab = tab === "learn" || tab === "practice" || tab === "lab" || tab === "insights" ? tab : pref === "practice-first" && topic.started ? "practice" : "learn";
  const engine = getTopicEngine(getStore(), user.id, topic.id);
  if (!engine) notFound();
  const blocksTopicId = engine.intervention?.blocksTopicId;
  const blocks = blocksTopicId ? state.topics.find((t) => t.id === blocksTopicId) : undefined;

  const analogies = state.profile.interests
    .map((interest) => ({ interest, text: analogyFor(topic.id, interest) }))
    .filter((a): a is { interest: typeof a.interest; text: string } => !!a.text);

  return (
    <div className="page py-8 lg:py-10">
      <nav aria-label="Breadcrumb" className="enter mb-4 flex items-center gap-1.5 text-sm text-muted">
        <Link href={`/student/path?course=${course.subjectId}`} className="transition hover:text-ink">{course.name} · {course.courseTitle}</Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="text-ink">{topic.name}</span>
      </nav>

      <header className="enter mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="t-title">{topic.name}</h1>
          <StatusPill status={topic.status} />
        </div>
        <p className="t-body mt-2 max-w-xl">{topic.description}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <TopicWorkspace
          key={topic.id}
          topicId={topic.id}
          topicName={topic.name}
          score={topic.score}
          level={topic.level}
          interests={state.profile.interests}
          lesson={LESSONS[topic.id]}
          analogies={analogies}
          labs={labs}
          initialTab={initialTab}
          engine={engine}
          intervention={engine.intervention ? summarizeIntervention(engine.intervention) : null}
          blocksName={blocks?.name}
        />
        <aside>
          <TopicSideCard topic={topic} />
        </aside>
      </div>
    </div>
  );
}
