"use client";

import { FileSpreadsheet, Plus } from "lucide-react";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/page";
import { Can } from "@/components/session";
import { Button } from "@/components/ui/button";
import { SubscriptionList } from "@/features/subscriptions/subscription-list";

export default function QuotationsPage() {
  return (
    <PageBody>
      <PageHeader
        title="Quotations"
        description="Offers being prepared or waiting for the customer. Confirm one to turn it into a subscription."
        actions={
          <Can permission="subscription.write">
            <Button variant="outline" asChild>
              <Link href="/console/quotation-templates">
                <FileSpreadsheet /> Templates
              </Link>
            </Button>
            <Button asChild>
              <Link href="/console/subscriptions/new">
                <Plus /> New quotation
              </Link>
            </Button>
          </Can>
        }
      />
      <SubscriptionList
        defaultStatus="quotation"
        statuses={[
          { value: "quotation", label: "Sent to customer" },
          { value: "draft", label: "Drafts" },
        ]}
        emptyTitle="No quotations here"
        emptyDescription="Start from a quotation template so the right plan and products are already filled in."
      />
    </PageBody>
  );
}
