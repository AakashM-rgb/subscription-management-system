"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/page";
import { Can } from "@/components/session";
import { Button } from "@/components/ui/button";
import { SubscriptionList } from "@/features/subscriptions/subscription-list";

export default function SubscriptionsPage() {
  return (
    <PageBody>
      <PageHeader
        title="Subscriptions"
        description="Every subscription and where it stands: Draft → Quotation → Confirmed → Active → Closed."
        actions={
          <Can permission="subscription.write">
            <Button asChild>
              <Link href="/console/subscriptions/new">
                <Plus /> New quotation
              </Link>
            </Button>
          </Can>
        }
      />
      <SubscriptionList
        defaultStatus=""
        showLifecycleFilters
        statuses={[
          { value: "", label: "All" },
          { value: "active", label: "Active" },
          { value: "confirmed", label: "Confirmed" },
          { value: "quotation", label: "Quotation" },
          { value: "draft", label: "Draft" },
          { value: "closed", label: "Closed" },
        ]}
        emptyTitle="No subscriptions yet"
        emptyDescription="Create a quotation for a customer; once confirmed it becomes a subscription that bills automatically."
      />
    </PageBody>
  );
}
