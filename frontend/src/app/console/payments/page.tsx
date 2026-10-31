"use client";

import { Ban, Plus, Wallet } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, FilterSelect, TableToolbar, type ColumnDef } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { PageBody, PageHeader } from "@/components/page";
import { Can, useCan } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHOD_LABEL, paymentColumns } from "@/features/columns";
import { RecordPaymentDialog } from "@/features/payments/record-payment-dialog";
import { api } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import { useApiMutation, usePaged } from "@/lib/api/hooks";
import type { Payment } from "@/lib/api/types";
import { formatDate, formatMoney } from "@/lib/format";
import { useListState } from "@/lib/use-list-state";

export default function PaymentsPage() {
  const list = useListState(["method", "status", "date_from", "date_to"] as const);
  const canVoid = useCan("payment.void");
  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [reason, setReason] = useState("");
  const query = usePaged<Payment>("payments", "/payments", {
    page: list.page,
    page_size: list.pageSize,
    method: list.filters.method,
    status: list.filters.status,
    date_from: list.filters.date_from,
    date_to: list.filters.date_to,
  });

  const voidPayment = useApiMutation<{ id: number; reason: string }, Payment>({
    mutationFn: ({ id, reason: r }) => api.post<Payment>(`/payments/${id}/void`, { reason: r } satisfies Body<"PaymentVoidIn">),
    invalidate: ["payments", "invoices", "reports", "customers"],
    success: (p) => `Payment ${p.number} voided; the invoice is open again`,
  });

  const columns: ColumnDef<Payment, unknown>[] = [
    ...(paymentColumns("/console") as ColumnDef<Payment, unknown>[]),
    {
      header: "Note",
      cell: ({ row }) => <span className="line-clamp-1 max-w-56 text-sm text-muted-foreground">{row.original.void_reason ?? row.original.note ?? "—"}</span>,
    },
  ];
  if (canVoid)
    columns.push({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: "right" },
      cell: ({ row }) =>
        row.original.status === "posted" ? (
          <Button size="sm" variant="ghost" onClick={() => setVoiding(row.original)} aria-label={`Void payment ${row.original.number}`}>
            <Ban /> Void
          </Button>
        ) : null,
    });

  return (
    <PageBody>
      <PageHeader
        title="Payments"
        description="Every payment recorded against an invoice, by method, amount, date and note."
        actions={
          <Can permission="payment.record">
            <Button onClick={() => setRecording(true)}>
              <Plus /> Record payment
            </Button>
          </Can>
        }
      />
      <TableToolbar>
        <FilterSelect
          label="Method"
          value={list.filters.method}
          onChange={(v) => list.setFilter("method", v)}
          options={Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect
          label="Status"
          value={list.filters.status}
          onChange={(v) => list.setFilter("status", v)}
          options={[
            { value: "posted", label: "Posted" },
            { value: "voided", label: "Voided" },
          ]}
        />
        <div className="flex items-center gap-2">
          <Label htmlFor="pay-from" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input id="pay-from" type="date" className="h-9 w-40 bg-background" value={list.filters.date_from} onChange={(e) => list.setFilter("date_from", e.target.value)} />
          <Label htmlFor="pay-to" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input id="pay-to" type="date" className="h-9 w-40 bg-background" value={list.filters.date_to} onChange={(e) => list.setFilter("date_to", e.target.value)} />
        </div>
      </TableToolbar>
      <DataTable
        caption="Payments"
        columns={columns}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={<EmptyState icon={Wallet} title="No payments recorded" description="Record payments as they arrive so outstanding invoices stay accurate." />}
      />
      <RecordPaymentDialog open={recording} onOpenChange={setRecording} />
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(o) => {
          if (!o) {
            setVoiding(null);
            setReason("");
          }
        }}
        title={`Void payment ${voiding?.number ?? ""}?`}
        description={
          voiding ? (
            <p>
              {formatMoney(voiding.amount)} received {formatDate(voiding.payment_date)} will no longer count towards invoice{" "}
              {voiding.invoice_number ?? `#${voiding.invoice_id}`}, which becomes payable again. This is recorded in the audit history.
            </p>
          ) : null
        }
        body={
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Reason (required)</Label>
            <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: cheque bounced" />
          </div>
        }
        canConfirm={reason.trim().length >= 3}
        confirmLabel="Void payment"
        destructive
        onConfirm={() => (voiding ? voidPayment.mutateAsync({ id: voiding.id, reason: reason.trim() }) : undefined)}
      />
    </PageBody>
  );
}
