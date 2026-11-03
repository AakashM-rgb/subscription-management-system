"use client";

import { AlertTriangle, FileClock, Mail, Pencil, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/feedback";
import { DetailList, PageBody, PageHeader, Section, StatCard } from "@/components/page";
import { Can } from "@/components/session";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { invoiceColumns, paymentColumns, subscriptionColumns } from "@/features/columns";
import { CustomerMandates } from "@/features/collections/mandates";
import { CustomerFormDialog } from "@/features/customers/customer-form";
import { api } from "@/lib/api/client";
import { useApiMutation, usePaged, useResource } from "@/lib/api/hooks";
import type { Customer, CustomerBalance, InvoiceListItem, Payment, SubscriptionListItem } from "@/lib/api/types";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const customer = useResource<Customer>(["customers", "detail", id], `/customers/${id}`);
  const balance = useResource<CustomerBalance>(["customers", "balance", id], `/customers/${id}/balance`);
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [subPage, setSubPage] = useState(1);
  const [invPage, setInvPage] = useState(1);
  const [payPage, setPayPage] = useState(1);

  const subscriptions = usePaged<SubscriptionListItem>("subscriptions", "/subscriptions", {
    customer_id: id,
    page: subPage,
    page_size: 10,
  });
  const invoices = usePaged<InvoiceListItem>("invoices", "/invoices", { customer_id: id, page: invPage, page_size: 10 });
  const payments = usePaged<Payment>("payments", "/payments", { customer_id: id, page: payPage, page_size: 10 });

  const invite = useApiMutation({
    mutationFn: () => api.post(`/customers/${id}/portal-invite`),
    invalidate: ["customers"],
    success: "Portal invitation sent",
  });

  if (customer.isPending) return <PageSkeleton />;
  if (customer.error) return <ErrorState error={customer.error} onRetry={() => customer.refetch()} />;
  const c = customer.data;

  return (
    <PageBody>
      <PageHeader
        back={{ href: "/console/customers", label: "Customers" }}
        title={c.name}
        badges={<StatusBadge kind="active" value={c.is_active} />}
        description={[c.company_name, c.email].filter(Boolean).join(" · ")}
        actions={
          <Can permission="customer.write">
            {!c.user_id ? (
              <Button variant="outline" onClick={() => setInviting(true)}>
                <Mail /> Invite to portal
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
            <Button asChild>
              <Link href={`/console/subscriptions/new?customer_id=${c.id}`}>
                <Plus /> New subscription
              </Link>
            </Button>
          </Can>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Outstanding"
          icon={Wallet}
          value={balance.data ? formatMoney(balance.data.outstanding_amount) : balance.isPending ? "…" : "—"}
          hint={balance.data ? `${formatNumber(balance.data.open_invoice_count)} open invoices` : undefined}
        />
        <StatCard
          label="Overdue"
          icon={AlertTriangle}
          tone={balance.data && Number(balance.data.overdue_amount) > 0 ? "danger" : "default"}
          value={balance.data ? formatMoney(balance.data.overdue_amount) : balance.isPending ? "…" : "—"}
          hint={balance.data ? `${formatNumber(balance.data.overdue_count)} overdue invoices` : undefined}
        />
        <StatCard
          label="Subscriptions"
          icon={FileClock}
          value={subscriptions.data ? formatNumber(subscriptions.data.total) : "…"}
          hint="All statuses"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Billing details" className="lg:col-span-1">
          <DetailList
            columns={1}
            items={[
              { label: "Email", value: c.email },
              { label: "Phone", value: c.phone ?? "—" },
              { label: "Company", value: c.company_name ?? "—" },
              { label: "Tax ID", value: c.tax_id ?? "—" },
              { label: "Address", value: <span className="whitespace-pre-line">{c.address ?? "—"}</span> },
              { label: "Portal access", value: c.user_id ? "Active" : "Not invited" },
              { label: "Customer since", value: formatDate(c.created_at) },
            ]}
          />
        </Section>

        <div className="min-w-0 lg:col-span-2">
          <Tabs defaultValue="subscriptions" className="gap-4">
            <TabsList className="max-w-full justify-start overflow-x-auto">
              <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="autopay">Autopay</TabsTrigger>
            </TabsList>
            <TabsContent value="subscriptions">
              <DataTable
                caption="Customer subscriptions"
                columns={subscriptionColumns("/console", { showCustomer: false })}
                data={subscriptions.data}
                isLoading={subscriptions.isPending}
                isFetching={subscriptions.isFetching}
                error={subscriptions.error}
                onRetry={() => subscriptions.refetch()}
                pagination={{ page: subPage, pageSize: 10, onPageChange: setSubPage }}
                rowHref={(row) => `/console/subscriptions/${row.id}`}
                empty={<EmptyState compact title="No subscriptions" description="Create a quotation to get started." />}
              />
            </TabsContent>
            <TabsContent value="invoices">
              <DataTable
                caption="Customer invoices"
                columns={invoiceColumns("/console", { showCustomer: false })}
                data={invoices.data}
                isLoading={invoices.isPending}
                isFetching={invoices.isFetching}
                error={invoices.error}
                onRetry={() => invoices.refetch()}
                pagination={{ page: invPage, pageSize: 10, onPageChange: setInvPage }}
                rowHref={(row) => `/console/invoices/${row.id}`}
                empty={<EmptyState compact title="No invoices yet" />}
              />
            </TabsContent>
            <TabsContent value="payments">
              <DataTable
                caption="Customer payments"
                columns={paymentColumns("/console")}
                data={payments.data}
                isLoading={payments.isPending}
                isFetching={payments.isFetching}
                error={payments.error}
                onRetry={() => payments.refetch()}
                pagination={{ page: payPage, pageSize: 10, onPageChange: setPayPage }}
                empty={<EmptyState compact title="No payments recorded" />}
              />
            </TabsContent>
            <TabsContent value="autopay">
              <CustomerMandates customerId={c.id} compact />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <CustomerFormDialog open={editing} onOpenChange={setEditing} customer={c} />
      <ConfirmDialog
        open={inviting}
        onOpenChange={setInviting}
        title="Invite to the customer portal?"
        description={
          <p>
            We will email <strong className="text-foreground">{c.email}</strong> a link to set a password. They will be
            able to see their own subscriptions, quotations and invoices.
          </p>
        }
        confirmLabel="Send invitation"
        onConfirm={() => invite.mutateAsync()}
      />
    </PageBody>
  );
}
