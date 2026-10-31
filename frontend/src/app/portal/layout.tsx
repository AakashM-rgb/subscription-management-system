import { PortalShell } from "@/components/shell/portal-shell";
import { requireRole } from "@/lib/server/session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["customer"], "/portal");
  return <PortalShell user={user}>{children}</PortalShell>;
}
