"use client";

import { CheckCheck, FileText } from "lucide-react";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, FilterSelect, SearchInput, SegmentedFilter, TableToolbar, type ColumnDef } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { PageBody, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invoiceColumns } from "@/features/columns";
import { api } from "@/lib/api/client";
import { useApiMutation, usePaged } from "@/lib/api/hooks";
import type { BulkConfirmResult, InvoiceListItem } from "@/lib/api/types";
import { pluralize } from "@/lib/format";
import { useListState } from "@/lib/use-list-state";

const SORTS = [
  { value: "-invoice_date", label: "Newest first" },
  { value: "due_date", label: "Due date (soonest)" },
  { value: "-amount_due", label: "Largest amount due" },
  { value: "-amount_total", label: "Largest total" },
  { value: "number", label: "Number" },
];

export default function InvoicesPage() {
  const list = useListState(["status", "overdue", "date_from", "date_to", "sort"] as const);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const status = list.filters.status;
  const query = usePaged<InvoiceListItem>("invoices", "/invoices", {
    page: list.page,
    page_size: list.pageSize,
    q: list.q,
    status: status === "overdue" ? "confirmed" : status,
    overdue: status === "overdue" ? true : undefined,
    date_from: list.filters.date_from,
    date_to: list.filters.date_to,
    sort: list.filters.sort,
  });

  const bulk = useApiMutation<number[], BulkConfirmResult>({
    mutationFn: (ids) => api.post<BulkConfirmResult>("/invoices/bulk-confirm", { invoice_ids: ids }),
    invalidate: ["invoices", "subscriptions", "reports"],
    success: (r) =>
      r.errors.length
        ? `${pluralize(r.confirmed.length, "invoice")} confirmed, ${r.errors.length} could not be confirmed (${r.errors[0].message})`
        : `${pluralize(r.confirmed.length, "invoice")} confirmed`,
    onSuccess: () => setSelected([]),
  });

  const rows = query.data?.items ?? [];
  const draftIds = rows.filter((r) => r.status === "draft").map((r) => r.id);
  const columns = useMemo<ColumnDef<InvoiceListItem, unknown>[]>(() => {
    const base = invoiceColumns("/console");
    if (status !== "draft") return base;
    return [
      {
        id: "select",
        meta: { className: "w-10" },
        header: () => (
          <Checkbox
            aria-label="Select all draft invoices on this page"
            checked={draftIds.length > 0 && draftIds.every((id) => selected.includes(id))}
            onCheckedChange={(c) => setSelected(c ? draftIds : [])}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select invoice ${row.original.id}`}
            checked={selected.includes(row.original.id)}
            onCheckedChange={(c) => setSelected((s) => (c ? [...s, row.original.id] : s.filter((x) => x !== row.original.id)))}
          />
        ),
      },
      ...base,
    ];
  }, [status, draftIds, selected]);

  return (
    <PageBody>
      <PageHeader
        title="Invoices"
        description="Generated from subscriptions on each billing date, with customer details, lines, taxes and totals filled in."
        actions={
          status === "draft" && selected.length ? (
            <Button onClick={() => setConfirmOpen(true)}>
              <CheckCheck /> Confirm {pluralize(selected.length, "invoice")}
            </Button>
          ) : null
        }
      />
      <SegmentedFilter
        label="Invoice status"
        value={status || "all"}
        onChange={(v) => {
          setSelected([]);
          list.setFilter("status", v === "all" ? "" : v);
        }}
        options={[
          { value: "all", label: "All" },
          { value: "draft", label: "Draft" },
          { value: "confirmed", label: "Confirmed" },
          { value: "overdue", label: "Overdue" },
          { value: "paid", label: "Paid" },
          { value: "cancelled", label: "Cancelled" },
        ]}
      />
      <TableToolbar>
        <SearchInput value={list.q} onChange={list.setSearch} placeholder="Invoice number or customer…" />
        <div className="flex items-center gap-2">
          <Label htmlFor="inv-from" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input id="inv-from" type="date" className="h-9 w-40 bg-background" value={list.filters.date_from} onChange={(e) => list.setFilter("date_from", e.target.value)} />
          <Label htmlFor="inv-to" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input id="inv-to" type="date" className="h-9 w-40 bg-background" value={list.filters.date_to} onChange={(e) => list.setFilter("date_to", e.target.value)} />
        </div>
        <FilterSelect label="Sort" allLabel="Default" value={list.filters.sort} onChange={(v) => list.setFilter("sort", v)} options={SORTS} />
      </TableToolbar>
      <DataTable
        caption="Invoices"
        columns={columns}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        rowHref={(row) => `/console/invoices/${row.id}`}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Invoices appear automatically when active subscriptions reach their billing date."
          />
        }
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Confirm ${pluralize(selected.length, "draft invoice")}?`}
        description="Each gets its permanent invoice number and due date. Invoices that can't be confirmed are reported and left as drafts."
        confirmLabel="Confirm invoices"
        onConfirm={() => bulk.mutateAsync(selected)}
      />
    </PageBody>
  );
}
