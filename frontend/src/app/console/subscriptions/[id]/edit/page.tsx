"use client";

import { use } from "react";

import { ErrorState, PageSkeleton } from "@/components/feedback";
import { PageBody, PageHeader } from "@/components/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubscriptionForm } from "@/features/subscriptions/subscription-form";
import { useResource } from "@/lib/api/hooks";
import type { Subscription } from "@/lib/api/types";

export default function EditSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useResource<Subscription>(["subscriptions", "detail", id], `/subscriptions/${id}`);
  if (query.isPending) return <PageSkeleton />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const s = query.data;
  return (
    <PageBody>
      <PageHeader back={{ href: `/console/subscriptions/${s.id}`, label: s.number }} title={`Edit ${s.number}`} />
      {s.available_actions.includes("edit") ? (
        <SubscriptionForm subscription={s} />
      ) : (
        <Alert>
          <AlertDescription>Only drafts and quotations can be edited. This subscription is {s.status}.</AlertDescription>
        </Alert>
      )}
    </PageBody>
  );
}
