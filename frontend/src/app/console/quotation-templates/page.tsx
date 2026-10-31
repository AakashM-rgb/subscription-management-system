"use client";

import { FileSpreadsheet, Pencil, Plus } from "lucide-react";
import Link from "next/link";

import { DataTable, FilterSelect, SearchInput, TableToolbar, type ColumnDef } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { PageBody, PageHeader, TextLink } from "@/components/page";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { usePaged } from "@/lib/api/hooks";
import { usePlanOptions } from "@/lib/api/reference";
import type { QuotationTemplate } from "@/lib/api/types";
import { BILLING_PERIOD_UNIT, pluralize } from "@/lib/format";
import { useListState } from "@/lib/use-list-state";

export default function QuotationTemplatesPage() {
  const list = useListState(["is_active"] as const);
  const plans = usePlanOptions();
  const query = usePaged<QuotationTemplate>("quotation-templates", "/quotation-templates", {
    page: list.page,
    page_size: list.pageSize,
    q: list.q,
    is_active: list.filters.is_active,
  });
  const planName = (id: number) => plans.data?.find((p) => p.id === id);

  const columns: ColumnDef<QuotationTemplate, unknown>[] = [
    {
      header: "Template",
      cell: ({ row }) => <TextLink href={`/console/quotation-templates/${row.original.id}`}>{row.original.name}</TextLink>,
    },
    {
      header: "Plan",
      cell: ({ row }) => {
        const plan = planName(row.original.plan_id);
        return plan ? `${plan.name} × ${row.original.plan_quantity}` : `Plan #${row.original.plan_id} × ${row.original.plan_quantity}`;
      },
    },
    {
      header: "Term",
      cell: ({ row }) => {
        const plan = planName(row.original.plan_id);
        return plan ? pluralize(row.original.term_periods, BILLING_PERIOD_UNIT[plan.billing_period]) : `${row.original.term_periods} periods`;
      },
    },
    { header: "Add-ons", meta: { align: "right" }, cell: ({ row }) => row.original.lines.length },
    { header: "Valid for", cell: ({ row }) => pluralize(row.original.validity_days, "day") },
    { header: "Status", cell: ({ row }) => <StatusBadge kind="active" value={row.original.is_active} /> },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: "right" },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/console/subscriptions/new?template_id=${row.original.id}`}>Use</Link>
          </Button>
          <Button size="icon-sm" variant="ghost" asChild aria-label={`Edit ${row.original.name}`}>
            <Link href={`/console/quotation-templates/${row.original.id}`}>
              <Pencil />
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageBody>
      <PageHeader
        title="Quotation templates"
        description="Ready-made offers with the right plan and product lines, valid for a set number of days."
        actions={
          <Button asChild>
            <Link href="/console/quotation-templates/new">
              <Plus /> New template
            </Link>
          </Button>
        }
      />
      <TableToolbar>
        <SearchInput value={list.q} onChange={list.setSearch} placeholder="Search templates…" />
        <FilterSelect
          label="Status"
          value={list.filters.is_active}
          onChange={(v) => list.setFilter("is_active", v)}
          options={[
            { value: "true", label: "Active" },
            { value: "false", label: "Inactive" },
          ]}
        />
      </TableToolbar>
      <DataTable
        caption="Quotation templates"
        columns={columns}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            icon={FileSpreadsheet}
            title="No templates yet"
            description="Save a standard offer once, then create quotations from it in seconds."
          />
        }
      />
    </PageBody>
  );
}
