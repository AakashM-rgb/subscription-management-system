"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Layers, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DataTable, FilterSelect, TableToolbar, type ColumnDef } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { FormDialog } from "@/components/form-dialog";
import { applyServerErrors, MoneyField, NumberField, SelectField, SwitchField, TextField } from "@/components/form-fields";
import { RecentlyAdded, useRecentlyAdded } from "@/components/recently-added";
import { PageBody, PageHeader } from "@/components/page";
import { Can, useCan } from "@/components/session";
import { Pill, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import { useApiMutation, usePaged } from "@/lib/api/hooks";
import { taxOption, useTaxOptions } from "@/lib/api/reference";
import type { BillingPeriod, Plan } from "@/lib/api/types";
import { BILLING_PERIOD_LABEL, BILLING_PERIOD_UNIT, formatDate, formatMoney, todayISO } from "@/lib/format";
import { useListState } from "@/lib/use-list-state";
import { dateString, intString, moneyString, optionalDateString } from "@/lib/validation";

const schema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    price: moneyString("Price"),
    billing_period: z.enum(["daily", "weekly", "monthly", "yearly"]),
    min_quantity: intString("Minimum quantity", 1),
    available_from: dateString("Start date"),
    available_until: optionalDateString,
    tax_id: z.string(),
    auto_close: z.boolean(),
    closable: z.boolean(),
    pausable: z.boolean(),
    renewable: z.boolean(),
    is_active: z.boolean(),
  })
  .refine((v) => !v.available_until || v.available_until >= v.available_from, {
    message: "End date must be on or after the start date",
    path: ["available_until"],
  });
type Values = z.infer<typeof schema>;

function toValues(plan?: Plan | null): Values {
  return {
    name: plan?.name ?? "",
    price: plan?.price ?? "",
    billing_period: plan?.billing_period ?? "monthly",
    min_quantity: String(plan?.min_quantity ?? 1),
    available_from: plan?.available_from ?? todayISO(),
    available_until: plan?.available_until ?? "",
    tax_id: plan?.tax ? String(plan.tax.id) : "",
    auto_close: plan?.auto_close ?? false,
    closable: plan?.closable ?? true,
    pausable: plan?.pausable ?? false,
    renewable: plan?.renewable ?? true,
    is_active: plan?.is_active ?? true,
  };
}

function PlanFormDialog({
  open,
  onOpenChange,
  plan,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  plan: Plan | null;
  onSaved?: (saved: Plan) => void;
}) {
  const taxes = useTaxOptions();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(plan) });
  useEffect(() => {
    if (open) form.reset(toValues(plan));
  }, [open, plan, form]);

  const mutation = useApiMutation<Values, Plan>({
    mutationFn: (v) => {
      const body = {
        name: v.name,
        price: v.price,
        billing_period: v.billing_period,
        min_quantity: Number(v.min_quantity),
        available_from: v.available_from,
        available_until: v.available_until || null,
        tax_id: v.tax_id ? Number(v.tax_id) : null,
        auto_close: v.auto_close,
        closable: v.closable,
        pausable: v.pausable,
        renewable: v.renewable,
      } satisfies Body<"PlanCreateIn">;
      return plan ? api.patch<Plan>(`/plans/${plan.id}`, { ...body, is_active: v.is_active } satisfies Body<"PlanUpdateIn">) : api.post<Plan>("/plans", body);
    },
    invalidate: ["plans"],
    success: plan ? "Plan updated" : "Plan created",
    toastError: false,
    onSuccess: (saved) => {
      onOpenChange(false);
      onSaved?.(saved);
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={plan ? "Edit plan" : "New plan"}
      description="Price is per seat for each billing period. Lifecycle rules decide what customers and staff can do."
      onSubmit={form.handleSubmit((v) =>
        mutation.mutateAsync(v).catch((e) => applyServerErrors(e, form.setError, { fields: Object.keys(v) })),
      )}
      pending={mutation.isPending}
      submitLabel={plan ? "Save plan" : "Create plan"}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="name" label="Plan name" required className="sm:col-span-2" />
        <MoneyField control={form.control} name="price" label="Price per seat" required />
        <SelectField
          control={form.control}
          name="billing_period"
          label="Billing frequency"
          required
          options={(Object.keys(BILLING_PERIOD_LABEL) as BillingPeriod[]).map((p) => ({ value: p, label: BILLING_PERIOD_LABEL[p] }))}
        />
        <NumberField control={form.control} name="min_quantity" label="Minimum quantity" required />
        <SelectField
          control={form.control}
          name="tax_id"
          label="Tax"
          allowEmpty
          emptyLabel="No tax"
          options={(taxes.data ?? []).map(taxOption)}
        />
        <TextField control={form.control} name="available_from" label="Available from" type="date" required />
        <TextField
          control={form.control}
          name="available_until"
          label="Available until"
          type="date"
          description="Leave empty to keep the plan available."
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Lifecycle rules</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <SwitchField control={form.control} name="auto_close" label="Close automatically" description="Subscriptions close on their own when the term ends." />
          <SwitchField control={form.control} name="closable" label="Can be closed early" description="Allow closing before the expiry date." />
          <SwitchField control={form.control} name="pausable" label="Can be paused" description="Paused periods are not billed." />
          <SwitchField control={form.control} name="renewable" label="Can be renewed" description="Extend the term by another set of periods." />
        </div>
      </fieldset>
      {plan ? <SwitchField control={form.control} name="is_active" label="Plan active" description="Inactive plans can't be used for new subscriptions." /> : null}
    </FormDialog>
  );
}

export default function PlansPage() {
  const list = useListState(["billing_period", "is_active"] as const);
  const recent = useRecentlyAdded<Plan>();
  const canWrite = useCan("catalog.write");
  const [dialog, setDialog] = useState<{ open: boolean; plan: Plan | null }>({ open: false, plan: null });
  const query = usePaged<Plan>("plans", "/plans", {
    page: list.page,
    page_size: list.pageSize,
    billing_period: list.filters.billing_period,
    is_active: list.filters.is_active,
  });

  const columns: ColumnDef<Plan, unknown>[] = [
    {
      header: "Plan",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">Minimum {row.original.min_quantity} seat(s)</p>
        </div>
      ),
    },
    {
      header: "Price",
      cell: ({ row }) => (
        <span className="tabular font-medium">
          {formatMoney(row.original.price)}
          <span className="font-normal text-muted-foreground"> / {BILLING_PERIOD_UNIT[row.original.billing_period]}</span>
        </span>
      ),
    },
    {
      header: "Available",
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap">
          {formatDate(row.original.available_from)} – {row.original.available_until ? formatDate(row.original.available_until) : "open"}
        </span>
      ),
    },
    {
      header: "Rules",
      cell: ({ row }) => {
        const p = row.original;
        const rules = [
          p.auto_close && "Auto-close",
          p.closable && "Closable",
          p.pausable && "Pausable",
          p.renewable && "Renewable",
        ].filter(Boolean) as string[];
        return (
          <div className="flex flex-wrap gap-1">
            {rules.length ? rules.map((r) => <Pill key={r} tone="neutral" label={r} />) : <span className="text-muted-foreground">—</span>}
          </div>
        );
      },
    },
    { header: "Status", cell: ({ row }) => <StatusBadge kind="active" value={row.original.is_active} /> },
  ];
  if (canWrite) {
    columns.push({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${row.original.name}`} onClick={() => setDialog({ open: true, plan: row.original })}>
          <Pencil />
        </Button>
      ),
    });
  }

  return (
    <PageBody>
      <PageHeader
        title="Plans"
        description="What each subscription costs, how often it bills, and what can happen during its life."
        actions={
          <Can permission="catalog.write">
            <Button onClick={() => setDialog({ open: true, plan: null })}>
              <Plus /> New plan
            </Button>
          </Can>
        }
      />
      <TableToolbar>
        <FilterSelect
          label="Frequency"
          value={list.filters.billing_period}
          onChange={(v) => list.setFilter("billing_period", v)}
          options={(Object.keys(BILLING_PERIOD_LABEL) as BillingPeriod[]).map((p) => ({ value: p, label: BILLING_PERIOD_LABEL[p] }))}
        />
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
      <RecentlyAdded
        items={recent.items}
        onClear={recent.clear}
        render={(p) => (
          <>
            <span className="font-medium">{p.name}</span>
            <span className="tabular text-muted-foreground">
              {formatMoney(p.price)} / {BILLING_PERIOD_UNIT[p.billing_period]}
            </span>
          </>
        )}
      />
      <DataTable
        caption="Plans"
        columns={columns}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={<EmptyState icon={Layers} title="No plans yet" description="Create a plan to start selling subscriptions." />}
      />
      <PlanFormDialog open={dialog.open} onOpenChange={(open) => setDialog((s) => ({ ...s, open }))} plan={dialog.plan} onSaved={(saved) => (dialog.plan ? recent.replace(saved) : recent.add(saved))} />
    </PageBody>
  );
}
