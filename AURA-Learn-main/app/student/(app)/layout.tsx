import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/lib/auth";
import { getStudentProfile } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function StudentShellLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("student");
  const profile = getStudentProfile(user.id);
  // New students choose their interests before anything else, so the whole product is personalised from the start.
  if (profile && !profile.onboarded) redirect("/student/onboarding");
  return (
    <AppShell role="student" user={{ name: user.name, subtitle: `Grade ${user.grade ?? 9} · Student` }}>
      {children}
    </AppShell>
  );
}
