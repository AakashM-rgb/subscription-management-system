"use client";

import { use } from "react";

import { ErrorState, PageSkeleton } from "@/components/feedback";
import { PageBody, PageHeader } from "@/components/page";
import { TemplateForm } from "@/features/templates/template-form";
import { useResource } from "@/lib/api/hooks";
import type { QuotationTemplate } from "@/lib/api/types";

export default function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useResource<QuotationTemplate>(["quotation-templates", "detail", id], `/quotation-templates/${id}`);
  if (query.isPending) return <PageSkeleton />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return (
    <PageBody className="max-w-4xl">
      <PageHeader back={{ href: "/console/quotation-templates", label: "Quotation templates" }} title={query.data.name} />
      <TemplateForm template={query.data} />
    </PageBody>
  );
}
