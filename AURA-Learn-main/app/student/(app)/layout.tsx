import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function StudentShellLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("student");
  return (
    <AppShell role="student" user={{ name: user.name, subtitle: `Grade ${user.grade ?? 9} · Student` }}>
      {children}
    </AppShell>
  );
}
