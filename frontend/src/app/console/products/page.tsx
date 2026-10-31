"use client";

import { Package, Plus } from "lucide-react";
import { useState } from "react";

import { DataTable, FilterSelect, SearchInput, TableToolbar, type ColumnDef } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { PageBody, PageHeader, TextLink } from "@/components/page";
import { Can } from "@/components/session";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ProductFormDialog } from "@/features/catalog/product-form";
import { usePaged } from "@/lib/api/hooks";
import type { Product } from "@/lib/api/types";
import { formatMoney, formatRate, humanize } from "@/lib/format";
import { useListState } from "@/lib/use-list-state";

const columns: ColumnDef<Product, unknown>[] = [
  {
    header: "Product",
    cell: ({ row }) => <TextLink href={`/console/products/${row.original.id}`}>{row.original.name}</TextLink>,
  },
  { header: "Type", cell: ({ row }) => humanize(row.original.product_type) },
  {
    header: "Tax",
    cell: ({ row }) =>
      row.original.tax ? `${row.original.tax.name} (${formatRate(row.original.tax.rate)})` : <span className="text-muted-foreground">None</span>,
  },
  { header: "Cost price", meta: { align: "right" }, cell: ({ row }) => formatMoney(row.original.cost_price) },
  {
    header: "Sales price",
    meta: { align: "right" },
    cell: ({ row }) => <span className="font-medium">{formatMoney(row.original.sales_price)}</span>,
  },
  { header: "Status", cell: ({ row }) => <StatusBadge kind="active" value={row.original.is_active} /> },
];

export default function ProductsPage() {
  const list = useListState(["product_type", "is_active"] as const);
  const [creating, setCreating] = useState(false);
  const query = usePaged<Product>("products", "/products", {
    page: list.page,
    page_size: list.pageSize,
    q: list.q,
    product_type: list.filters.product_type,
    is_active: list.filters.is_active,
  });

  return (
    <PageBody>
      <PageHeader
        title="Products"
        description="Software, add-ons and goods you sell on subscription, with their variants and prices."
        actions={
          <Can permission="catalog.write">
            <Button onClick={() => setCreating(true)}>
              <Plus /> New product
            </Button>
          </Can>
        }
      />
      <TableToolbar>
        <SearchInput value={list.q} onChange={list.setSearch} placeholder="Search products…" />
        <FilterSelect
          label="Type"
          value={list.filters.product_type}
          onChange={(v) => list.setFilter("product_type", v)}
          options={[
            { value: "service", label: "Service" },
            { value: "goods", label: "Goods" },
          ]}
        />
        <FilterSelect
          label="Status"
          value={list.filters.is_active}
          onChange={(v) => list.setFilter("is_active", v)}
          options={[
            { value: "true", label: "Active" },
            { value: "false", label: "Archived" },
          ]}
        />
      </TableToolbar>
      <DataTable
        caption="Products"
        columns={columns}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        rowHref={(row) => `/console/products/${row.id}`}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Add the products you sell, then offer them through plans and quotations."
          />
        }
      />
      <ProductFormDialog open={creating} onOpenChange={setCreating} />
    </PageBody>
  );
}
