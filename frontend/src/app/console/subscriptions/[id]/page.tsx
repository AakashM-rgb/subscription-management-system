"use client";

import { CreditCard, History, ReceiptText } from "lucide-react";
import { use, useState } from "react";

import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/feedback";
import { PageBody, PageHeader, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomerMandates } from "@/features/collections/mandates";
import { invoiceColumns } from "@/features/columns";
import { EventTimeline } from "@/features/subscriptions/event-timeline";
import { SubscriptionActions } from "@/features/subscriptions/subscription-actions";
import {
  BillingAutomationPanel,
  LifecycleStepper,
  LinesTable,
  SubscriptionStatusBadges,
  SubscriptionSummary,
} from "@/features/subscriptions/subscription-view";
import { usePaged, useResource } from "@/lib/api/hooks";
import type { AuditEvent, InvoiceListItem, Subscription } from "@/lib/api/types";

export default function SubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useResource<Subscription>(["subscriptions", "detail", id], `/subscriptions/${id}`);
  const [invoicePage, setInvoicePage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const invoices = usePaged<InvoiceListItem>("invoices", `/subscriptions/${id}/invoices`, { page: invoicePage, page_size: 10 });
  const events = usePaged<AuditEvent>("subscriptions", `/subscriptions/${id}/events`, { page: eventPage, page_size: 20 });

  if (query.isPending) return <PageSkeleton />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const s = query.data;
  const isQuote = s.status === "draft" || s.status === "quotation";

  return (
    <PageBody>
      <PageHeader
        back={isQuote ? { href: "/console/quotations", label: "Quotations" } : { href: "/console/subscriptions", label: "Subscriptions" }}
        title={<span className="tabular">{s.number}</span>}
        badges={<SubscriptionStatusBadges subscription={s} />}
        description={`${s.customer.name} · ${s.plan.name}`}
        actions={<SubscriptionActions subscription={s} area="console" />}
      />

      <Section>
        <LifecycleStepper status={s.status} />
      </Section>

      <BillingAutomationPanel subscription={s} invoiceHref={(invoiceId) => `/console/invoices/${invoiceId}`} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Details" className="xl:col-span-1">
          <SubscriptionSummary subscription={s} customerHref={`/console/customers/${s.customer.id}`} />
        </Section>
        <Section title="Order lines" description="Prices, taxes and discounts as calculated by the server." className="xl:col-span-2" contentClassName="p-0">
          <LinesTable lines={s.lines} totals={s} caption={`Lines of ${s.number}`} />
        </Section>
      </div>

      <Tabs defaultValue="billing" className="gap-4">
        <TabsList>
          <TabsTrigger value="billing">
            <ReceiptText /> Billing history
          </TabsTrigger>
          <TabsTrigger value="activity">
            <History /> Activity
          </TabsTrigger>
          <TabsTrigger value="autopay">
            <CreditCard /> Autopay
          </TabsTrigger>
        </TabsList>
        <TabsContent value="billing">
          <DataTable
            caption={`Invoices for ${s.number}`}
            columns={invoiceColumns("/console", { showCustomer: false, showSubscription: false })}
            data={invoices.data}
            isLoading={invoices.isPending}
            isFetching={invoices.isFetching}
            error={invoices.error}
            onRetry={() => invoices.refetch()}
            pagination={{ page: invoicePage, pageSize: 10, onPageChange: setInvoicePage }}
            rowHref={(row) => `/console/invoices/${row.id}`}
            empty={
              <EmptyState
                compact
                icon={ReceiptText}
                title="No invoices yet"
                description="Invoices are generated automatically on each billing date once the subscription is active."
              />
            }
          />
        </TabsContent>
        <TabsContent value="activity">
          <Section title="Lifecycle & billing history" description="Every change, pause, renewal and invoice, newest first.">
            {events.isPending ? (
              <TableSkeleton rows={4} columns={2} />
            ) : events.error ? (
              <ErrorState compact error={events.error} onRetry={() => events.refetch()} />
            ) : events.data.items.length === 0 ? (
              <EmptyState compact icon={History} title="No activity yet" />
            ) : (
              <>
                <EventTimeline events={events.data.items} />
                {events.data.total > events.data.page * events.data.page_size || eventPage > 1 ? (
                  <div className="mt-4 flex justify-between">
                    <Button variant="outline" size="sm" disabled={eventPage <= 1} onClick={() => setEventPage((p) => p - 1)}>
                      Newer
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={events.data.total <= events.data.page * events.data.page_size}
                      onClick={() => setEventPage((p) => p + 1)}
                    >
                      Older
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </Section>
        </TabsContent>
        <TabsContent value="autopay" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {s.auto_collect
              ? "Automatic collection is on: confirmed invoices are charged to the active mandate below."
              : "Automatic collection is off for this subscription; invoices are paid manually."}
          </p>
          <CustomerMandates customerId={s.customer.id} compact />
        </TabsContent>
      </Tabs>
    </PageBody>
  );
}
