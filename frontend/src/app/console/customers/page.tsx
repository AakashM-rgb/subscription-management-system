"use client";

import { Plus, Users } from "lucide-react";
import { useState } from "react";

import { DataTable, FilterSelect, SearchInput, TableToolbar, type ColumnDef } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { PageBody, PageHeader } from "@/components/page";
import { Can } from "@/components/session";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { CustomerFormDialog } from "@/features/customers/customer-form";
import { usePaged } from "@/lib/api/hooks";
import type { Customer } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useListState } from "@/lib/use-list-state";

const columns: ColumnDef<Customer, unknown>[] = [
  {
    header: "Customer",
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.original.name}</p>
        <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
      </div>
    ),
  },
  { header: "Company", cell: ({ row }) => row.original.company_name ?? <span className="text-muted-foreground">—</span> },
  { header: "Phone", cell: ({ row }) => row.original.phone ?? <span className="text-muted-foreground">—</span> },
  {
    header: "Portal",
    cell: ({ row }) =>
      row.original.user_id ? (
        <span className="text-sm">Has access</span>
      ) : (
        <span className="text-sm text-muted-foreground">Not invited</span>
      ),
  },
  { header: "Since", cell: ({ row }) => formatDate(row.original.created_at) },
  { header: "Status", cell: ({ row }) => <StatusBadge kind="active" value={row.original.is_active} /> },
];

export default function CustomersPage() {
  const list = useListState(["is_active"] as const);
  const [creating, setCreating] = useState(false);
  const query = usePaged<Customer>("customers", "/customers", {
    page: list.page,
    page_size: list.pageSize,
    q: list.q,
    is_active: list.filters.is_active,
  });

  return (
    <PageBody>
      <PageHeader
        title="Customers"
        description="Everyone you bill: businesses on monthly plans through to yearly enterprise contracts."
        actions={
          <Can permission="customer.write">
            <Button onClick={() => setCreating(true)}>
              <Plus /> New customer
            </Button>
          </Can>
        }
      />
      <TableToolbar>
        <SearchInput value={list.q} onChange={list.setSearch} placeholder="Search name, email or company…" />
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
        caption="Customers"
        columns={columns}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        rowHref={(row) => `/console/customers/${row.id}`}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            icon={Users}
            title="No customers yet"
            description="Customers appear here when they sign up through the portal or when your team adds them."
            action={
              <Can permission="customer.write">
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus /> Add a customer
                </Button>
              </Can>
            }
          />
        }
      />
      <CustomerFormDialog open={creating} onOpenChange={setCreating} />
    </PageBody>
  );
}
