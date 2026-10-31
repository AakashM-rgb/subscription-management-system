"use client";

import { DetailList, PageBody, PageHeader, Section } from "@/components/page";
import { useSession } from "@/components/session";
import { ChangePasswordSection } from "@/features/account/change-password";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";

export default function AccountPage() {
  const user = useSession();
  return (
    <PageBody className="max-w-3xl">
      <PageHeader title="Your account" description="Your sign-in details and password." />
      <Section title="Profile">
        <DetailList
          items={[
            { label: "Name", value: user.full_name },
            { label: "Email", value: user.email },
            { label: "Role", value: ROLE_LABEL[user.role] },
            { label: "Member since", value: formatDate(user.created_at) },
          ]}
        />
      </Section>
      <ChangePasswordSection />
    </PageBody>
  );
}
