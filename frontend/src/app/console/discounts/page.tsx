"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BadgePercent, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { DataTable, FilterSelect, TableToolbar, type ColumnDef } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { FormDialog } from "@/components/form-dialog";
import {
  applyServerErrors,
  MoneyField,
  NumberField,
  SelectField,
  SwitchField,
  TextField,
} from "@/components/form-fields";
import { PageBody, PageHeader } from "@/components/page";
import { Can, useCan } from "@/components/session";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api/client";
import { useApiMutation, usePaged } from "@/lib/api/hooks";
import { useProductOptions } from "@/lib/api/reference";
import type { Discount } from "@/lib/api/types";
import { formatDate, formatMoney, formatNumber, formatRate, todayISO } from "@/lib/format";
import { useListState } from "@/lib/use-list-state";
import { dateString, optionalDateString, optionalIntString, optionalMoneyString, positiveMoneyString, toIntOrNull } from "@/lib/validation";

const schema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    kind: z.enum(["fixed", "percentage"]),
    value: positiveMoneyString("Value"),
    scope: z.enum(["subscription", "product"]),
    product_ids: z.array(z.number()),
    min_purchase_amount: optionalMoneyString("Minimum purchase"),
    min_quantity: optionalIntString("Minimum quantity", 1),
    valid_from: dateString("Start date"),
    valid_until: optionalDateString,
    usage_limit: optionalIntString("Usage limit", 1),
    is_active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "percentage" && Number(v.value) > 100)
      ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage cannot exceed 100" });
    if (v.scope === "product" && v.product_ids.length === 0)
      ctx.addIssue({ code: "custom", path: ["product_ids"], message: "Choose at least one product" });
    if (v.valid_until && v.valid_until < v.valid_from)
      ctx.addIssue({ code: "custom", path: ["valid_until"], message: "End date must be on or after the start date" });
  });
type Values = z.infer<typeof schema>;

function toValues(d?: Discount | null): Values {
  return {
    name: d?.name ?? "",
    kind: d?.kind ?? "percentage",
    value: d?.value ?? "",
    scope: d?.scope ?? "subscription",
    product_ids: d?.products.map((p) => p.id) ?? [],
    min_purchase_amount: d?.min_purchase_amount ?? "",
    min_quantity: d?.min_quantity ? String(d.min_quantity) : "",
    valid_from: d?.valid_from ?? todayISO(),
    valid_until: d?.valid_until ?? "",
    usage_limit: d?.usage_limit ? String(d.usage_limit) : "",
    is_active: d?.is_active ?? true,
  };
}

function DiscountFormDialog({ open, onOpenChange, discount }: { open: boolean; onOpenChange: (o: boolean) => void; discount: Discount | null }) {
  const products = useProductOptions();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(discount) });
  useEffect(() => {
    if (open) form.reset(toValues(discount));
  }, [open, discount, form]);
  const kind = useWatch({ control: form.control, name: "kind" });
  const scope = useWatch({ control: form.control, name: "scope" });

  const mutation = useApiMutation<Values, Discount>({
    mutationFn: (v) => {
      const body = {
        name: v.name,
        kind: v.kind,
        value: v.value,
        scope: v.scope,
        product_ids: v.scope === "product" ? v.product_ids : [],
        min_purchase_amount: v.min_purchase_amount || null,
        min_quantity: toIntOrNull(v.min_quantity),
        valid_from: v.valid_from,
        valid_until: v.valid_until || null,
        usage_limit: toIntOrNull(v.usage_limit),
      };
      return discount
        ? api.patch<Discount>(`/discounts/${discount.id}`, { ...body, is_active: v.is_active })
        : api.post<Discount>("/discounts", body);
    },
    invalidate: ["discounts"],
    success: discount ? "Discount updated" : "Discount created",
    toastError: false,
    onSuccess: () => onOpenChange(false),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={discount ? "Edit discount rule" : "New discount rule"}
      description="Once attached to a subscription, the discount appears on each invoice automatically and stops when it expires or runs out."
      onSubmit={form.handleSubmit((v) =>
        mutation.mutateAsync(v).catch((e) => applyServerErrors(e, form.setError, { fields: Object.keys(v), duplicateField: "name" })),
      )}
      pending={mutation.isPending}
      submitLabel={discount ? "Save discount" : "Create discount"}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="name" label="Name" required className="sm:col-span-2" placeholder="Volume seats 10%" />
        <SelectField
          control={form.control}
          name="kind"
          label="Type"
          required
          options={[
            { value: "percentage", label: "Percentage" },
            { value: "fixed", label: "Fixed amount" },
          ]}
        />
        {kind === "percentage" ? (
          <TextField control={form.control} name="value" label="Percentage" inputMode="decimal" required placeholder="10" />
        ) : (
          <MoneyField control={form.control} name="value" label="Amount" required />
        )}
        <SelectField
          control={form.control}
          name="scope"
          label="Applies to"
          required
          className="sm:col-span-2"
          options={[
            { value: "subscription", label: "Whole subscription" },
            { value: "product", label: "Specific products" },
          ]}
        />
      </div>
      {scope === "product" ? (
        <Controller
          control={form.control}
          name="product_ids"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel>Products</FieldLabel>
              <ScrollArea className="h-40 rounded-lg border bg-background">
                <ul className="divide-y">
                  {(products.data ?? []).map((product) => {
                    const checked = field.value.includes(product.id);
                    const id = `discount-product-${product.id}`;
                    return (
                      <li key={product.id} className="flex items-center gap-3 px-3 py-2">
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(next) =>
                            field.onChange(next ? [...field.value, product.id] : field.value.filter((pid) => pid !== product.id))
                          }
                        />
                        <label htmlFor={id} className="flex-1 text-sm">
                          {product.name}
                        </label>
                        <span className="tabular text-xs text-muted-foreground">{formatMoney(product.sales_price)}</span>
                      </li>
                    );
                  })}
                  {products.data?.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">No active products.</li> : null}
                </ul>
              </ScrollArea>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField control={form.control} name="min_purchase_amount" label="Minimum purchase" description="Optional. Subtotal needed to qualify." />
        <NumberField control={form.control} name="min_quantity" label="Minimum quantity" description="Optional. Seats needed to qualify." />
        <TextField control={form.control} name="valid_from" label="Valid from" type="date" required />
        <TextField control={form.control} name="valid_until" label="Valid until" type="date" description="Leave empty for no end date." />
        <NumberField control={form.control} name="usage_limit" label="Usage limit" description="Optional. Number of invoices it can apply to." />
      </div>
      {discount ? <SwitchField control={form.control} name="is_active" label="Discount active" /> : null}
    </FormDialog>
  );
}

function describeValue(d: Discount) {
  return d.kind === "percentage" ? `${formatRate(d.value)} off` : `${formatMoney(d.value)} off`;
}

export default function DiscountsPage() {
  const list = useListState(["scope", "is_active"] as const);
  const canWrite = useCan("discount.write");
  const [dialog, setDialog] = useState<{ open: boolean; discount: Discount | null }>({ open: false, discount: null });
  const query = usePaged<Discount>("discounts", "/discounts", {
    page: list.page,
    page_size: list.pageSize,
    scope: list.filters.scope,
    is_active: list.filters.is_active,
  });

  const columns: ColumnDef<Discount, unknown>[] = [
    {
      header: "Discount",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{describeValue(row.original)}</p>
        </div>
      ),
    },
    {
      header: "Applies to",
      cell: ({ row }) =>
        row.original.scope === "subscription" ? (
          "Whole subscription"
        ) : (
          <span className="text-sm">{row.original.products.map((p) => p.name).join(", ") || "Products"}</span>
        ),
    },
    {
      header: "Conditions",
      cell: ({ row }) => {
        const d = row.original;
        const parts = [
          d.min_purchase_amount ? `Min. ${formatMoney(d.min_purchase_amount)}` : null,
          d.min_quantity ? `Min. ${d.min_quantity} seats` : null,
        ].filter(Boolean);
        return parts.length ? <span className="text-sm">{parts.join(" · ")}</span> : <span className="text-muted-foreground">None</span>;
      },
    },
    {
      header: "Validity",
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap">
          {formatDate(row.original.valid_from)} – {row.original.valid_until ? formatDate(row.original.valid_until) : "no end"}
        </span>
      ),
    },
    {
      header: "Uses",
      meta: { align: "right" },
      cell: ({ row }) =>
        `${formatNumber(row.original.usage_count)}${row.original.usage_limit ? ` / ${formatNumber(row.original.usage_limit)}` : ""}`,
    },
    { header: "State", cell: ({ row }) => <StatusBadge kind="discount" value={row.original.state} /> },
  ];
  if (canWrite) {
    columns.push({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${row.original.name}`} onClick={() => setDialog({ open: true, discount: row.original })}>
          <Pencil />
        </Button>
      ),
    });
  }

  return (
    <PageBody>
      <PageHeader
        title="Discounts"
        description="Discount rules created by admins. Staff can attach active rules to subscriptions."
        actions={
          <Can permission="discount.write">
            <Button onClick={() => setDialog({ open: true, discount: null })}>
              <Plus /> New discount
            </Button>
          </Can>
        }
      />
      <TableToolbar>
        <FilterSelect
          label="Applies to"
          value={list.filters.scope}
          onChange={(v) => list.setFilter("scope", v)}
          options={[
            { value: "subscription", label: "Whole subscription" },
            { value: "product", label: "Specific products" },
          ]}
        />
        <FilterSelect
          label="Status"
          value={list.filters.is_active}
          onChange={(v) => list.setFilter("is_active", v)}
          options={[
            { value: "true", label: "Enabled" },
            { value: "false", label: "Disabled" },
          ]}
        />
      </TableToolbar>
      <DataTable
        caption="Discount rules"
        columns={columns}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={<EmptyState icon={BadgePercent} title="No discount rules" description="Create a rule, for example a volume discount for more seats." />}
      />
      <DiscountFormDialog open={dialog.open} onOpenChange={(open) => setDialog((s) => ({ ...s, open }))} discount={dialog.discount} />
    </PageBody>
  );
}
