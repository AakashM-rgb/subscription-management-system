import type { Metadata } from "next";
import { Suspense } from "react";

import { SetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Accept invitation" };

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <SetPasswordForm mode="invite" />
    </Suspense>
  );
}
