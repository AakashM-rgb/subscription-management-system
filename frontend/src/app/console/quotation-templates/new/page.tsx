import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/page";
import { TemplateForm } from "@/features/templates/template-form";

export const metadata: Metadata = { title: "New quotation template" };

export default function NewTemplatePage() {
  return (
    <PageBody className="max-w-4xl">
      <PageHeader back={{ href: "/console/quotation-templates", label: "Quotation templates" }} title="New quotation template" />
      <TemplateForm />
    </PageBody>
  );
}
