import { redirect } from "next/navigation";

import { homeFor } from "@/lib/permissions";
import { getSessionUser } from "@/lib/server/session";

export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? homeFor(user.role) : "/login");
}
