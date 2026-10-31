import { ConsoleShell } from "@/components/shell/console-shell";
import { requireRole } from "@/lib/server/session";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["admin", "staff"], "/console");
  return <ConsoleShell user={user}>{children}</ConsoleShell>;
}
