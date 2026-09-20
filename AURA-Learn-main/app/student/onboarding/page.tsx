import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { OnboardingFlow } from "@/components/student/OnboardingFlow";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { requireUser } from "@/lib/auth";
import { getStudentProfile } from "@/lib/repo";

export const metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser("student");
  const profile = getStudentProfile(user.id);
  const { edit } = await searchParams;
  const editMode = edit === "1";
  if (profile?.onboarded && !editMode) redirect("/student/learn");

  return (
    <div className="min-h-dvh">
      <header className="flex h-16 items-center justify-between px-4 sm:px-8">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="px-4 pb-16 pt-4 sm:px-8 sm:pt-10">
        <OnboardingFlow
          editMode={editMode}
          initial={{
            name: user.name,
            grade: user.grade ?? 9,
            school: user.school ?? "",
            interests: profile?.interests ?? [],
            preference: profile?.learningPreference ?? null,
          }}
        />
      </main>
    </div>
  );
}
