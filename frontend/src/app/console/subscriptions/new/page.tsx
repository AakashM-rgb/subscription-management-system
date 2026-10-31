"use client";

import { useSearchParams } from "next/navigation";

import { PageBody, PageHeader } from "@/components/page";
import { SubscriptionForm } from "@/features/subscriptions/subscription-form";

export default function NewSubscriptionPage() {
  const params = useSearchParams();
  return (
    <PageBody>
      <PageHeader
        back={{ href: "/console/quotations", label: "Quotations" }}
        title="New quotation"
        description="Build an offer from a template or from scratch. It starts as a draft you can send to the customer."
      />
      <SubscriptionForm initialCustomerId={params.get("customer_id")} initialTemplateId={params.get("template_id")} />
    </PageBody>
  );
}
