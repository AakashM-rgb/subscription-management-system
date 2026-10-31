"use client";

import { useSession } from "@/components/session";
import { AdminDashboard, StaffDashboard } from "@/features/dashboard/dashboards";

export default function ConsoleHome() {
  const user = useSession();
  return user.role === "admin" ? <AdminDashboard /> : <StaffDashboard />;
}
