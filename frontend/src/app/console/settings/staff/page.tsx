import type { Metadata } from "next";

import { StaffPage } from "@/features/staff/staff-page";
import { requireRole } from "@/lib/server/session";

export const metadata: Metadata = { title: "Staff" };

/** Admin only: enforced here on the server, in the navigation, and by the API (403). */
export default async function Page() {
  await requireRole(["admin"], "/console/settings/staff");
  return <StaffPage />;
}
