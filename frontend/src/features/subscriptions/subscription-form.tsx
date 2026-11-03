"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Info, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { EntityCombobox } from "@/components/entity-combobox";
import { InlineSpinner } from "@/components/feedback";
import { applyServerErrors, NumberField, SelectField, TextareaField, TextField } from "@/components/form-fields";
import { Section } from "@/components/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductLineRow, type LinesForm } from "@/features/subscriptions/line-row";
import { TotalsRows } from "@/features/subscriptions/subscription-view";
import { api, ApiError, errorMessage } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import { useAllPages, useResource } from "@/lib/api/hooks";
import {
  planOption,
  termOption,
  useDiscountOptions,
  usePaymentTermOptions,
  usePlanOptions,
  useProductOptions,
} from "@/lib/api/reference";
import type {
  Customer,
  LineInput,
  PricingPreview,
  PricingPreviewInput,
  QuotationTemplate,
  Subscription,
} from "@/lib/api/types";
import { BILLING_PERIOD_UNIT, formatMoney, formatRate, todayISO } from "@/lib/format";
import { dateString, idString, intString, optionalMoneyString } from "@/lib/validation";
import { useSingleFlight } from "@/lib/use-single-flight";

const lineSchema = z.object({
  product_id: idString("product"),
  variant_id: z.string(),
  quantity: intString("Quantity", 1),
  unit_price: optionalMoneyString("Unit price"),
});

const schema = z.object({
  customer_id: idString("customer"),
  template_id: z.string(),
  plan_id: idString("plan"),
  plan_quantity: intString("Seats", 1),
  start_date: dateString("Start date"),
  term_periods: intString("Term", 1).refine((v) => Number(v) <= 1200, "Term is too long"),
  payment_term_id: idString("payment term"),
  discount_id: z.string(),
  notes: z.string().max(5000),
  lines: z.array(lineSchema),
});
type Values = z.infer<typeof schema>;

function valuesFrom(subscription?: Subscription | null, customerId?: string | null): Values {
  if (!subscription) {
    return {
      customer_id: customerId ?? "",
      template_id: "",
      plan_id: "",
      plan_quantity: "1",
      start_date: todayISO(),
      term_periods: "12",
      payment_term_id: "",
      discount_id: "",
      notes: "",
      lines: [],
    };
  }
  const planLine = subscription.lines.find((l) => l.line_type === "plan");
  return {
    customer_id: String(subscription.customer.id),
    template_id: subscription.template_id ? String(subscription.template_id) : "",
    plan_id: String(subscription.plan.id),
    plan_quantity: String(planLine?.quantity ?? subscription.plan.min_quantity),
    start_date: subscription.start_date,
    term_periods: String(subscription.term_periods),
    payment_term_id: String(subscription.payment_term.id),
    discount_id: subscription.discount ? String(subscription.discount.id) : "",
    notes: subscription.notes ?? "",
    lines: subscription.lines
      .filter((l) => l.line_type === "product" && l.product_id)
      .map((l) => ({
        product_id: String(l.product_id),
        variant_id: l.variant_id ? String(l.variant_id) : "",
        quantity: String(l.quantity),
        unit_price: l.unit_price,
      })),
  };
}

function toLines(lines: Values["lines"]): LineInput[] {
  return lines.map((l) => ({
    product_id: Number(l.product_id),
    variant_id: l.variant_id ? Number(l.variant_id) : null,
    quantity: Number(l.quantity),
    unit_price: l.unit_price ? l.unit_price : null,
  }));
}

export function SubscriptionForm({
  subscription,
  initialCustomerId,
  initialTemplateId,
}: {
  subscription?: Subscription | null;
  initialCustomerId?: string | null;
  initialTemplateId?: string | null;
}) {
  const router = useRouter();
  const editing = Boolean(subscription);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: valuesFrom(subscription, initialCustomerId) });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const singleFlight = useSingleFlight();

  const plans = usePlanOptions();
  const terms = usePaymentTermOptions();
  const products = useProductOptions();
  const discounts = useDiscountOptions({ usable_on_date: todayISO() });
  const templates = useAllPages<QuotationTemplate>("quotation-templates", "/quotation-templates", { is_active: true }, !editing);
  const initialCustomer = useResource<Customer>(
    ["customers", "detail", initialCustomerId ?? subscription?.customer.id ?? "none"],
    initialCustomerId ? `/customers/${initialCustomerId}` : null,
  );

  const [planId, planQty, watchedLines, discountId, templateId] = useWatch({
    control: form.control,
    name: ["plan_id", "plan_quantity", "lines", "discount_id", "template_id"],
  });
  const plan = plans.data?.find((p) => String(p.id) === planId) ?? (subscription && String(subscription.plan.id) === planId ? subscription.plan : undefined);

  // Default the payment term once terms load.
  useEffect(() => {
    if (!form.getValues("payment_term_id") && terms.data?.length) form.setValue("payment_term_id", String(terms.data[0].id));
  }, [terms.data, form]);

  async function applyTemplate(templateId: string) {
    form.setValue("template_id", templateId);
    if (!templateId) return;
    try {
      const t = await api.get<QuotationTemplate>(`/quotation-templates/${templateId}`);
      form.setValue("plan_id", String(t.plan_id), { shouldValidate: true });
      form.setValue("plan_quantity", String(t.plan_quantity), { shouldValidate: true });
      form.setValue("term_periods", String(t.term_periods), { shouldValidate: true });
      if (t.payment_term_id) form.setValue("payment_term_id", String(t.payment_term_id), { shouldValidate: true });
      if (t.notes) form.setValue("notes", t.notes);
      lines.replace(
        t.lines.map((l) => ({
          product_id: String(l.product_id),
          variant_id: l.variant_id ? String(l.variant_id) : "",
          quantity: String(l.quantity),
          unit_price: l.unit_price ?? "",
        })),
      );
      toast.success(`Filled from template “${t.name}”`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  useEffect(() => {
    if (initialTemplateId && !editing) void applyTemplate(initialTemplateId);
    // Only on first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- live server pricing
  const previewBody = useMemo<PricingPreviewInput | null>(() => {
    if (!/^\d+$/.test(planId) || !/^\d+$/.test(planQty) || Number(planQty) < 1) return null;
    const valid = (watchedLines ?? []).filter((l) => /^\d+$/.test(l.product_id) && /^\d+$/.test(l.quantity) && Number(l.quantity) >= 1);
    return {
      plan_id: Number(planId),
      plan_quantity: Number(planQty),
      lines: toLines(valid.map((l) => ({ ...l, unit_price: /^\d+(\.\d{1,2})?$/.test(l.unit_price) ? l.unit_price : "" }))),
      discount_id: editing ? (subscription?.discount?.id ?? null) : discountId ? Number(discountId) : null,
    };
  }, [planId, planQty, watchedLines, discountId, editing, subscription]);
  const [debouncedBody, setDebouncedBody] = useState(previewBody);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBody(previewBody), 400);
    return () => clearTimeout(timer);
  }, [previewBody]);
  const preview = useQuery({
    queryKey: ["pricing-preview", debouncedBody],
    queryFn: () => api.post<PricingPreview>("/pricing/preview", debouncedBody satisfies Body<"PricingPreviewIn"> | null),
    enabled: debouncedBody !== null,
    placeholderData: (previous) => previous,
    retry: false,
  });

  // ---------------------------------------------------------------- submit
  async function onSubmit(values: Values) {
    if (plan && Number(values.plan_quantity) < plan.min_quantity) {
      form.setError("plan_quantity", { message: `This plan needs at least ${plan.min_quantity} seats` });
      return;
    }
    const body = {
      customer_id: Number(values.customer_id),
      plan_id: Number(values.plan_id),
      plan_quantity: Number(values.plan_quantity),
      start_date: values.start_date,
      term_periods: Number(values.term_periods),
      payment_term_id: Number(values.payment_term_id),
      notes: values.notes.trim() || null,
      lines: toLines(values.lines),
    } satisfies Body<"SubscriptionUpdateIn">;
    try {
      const saved = editing
        ? await api.patch<Subscription>(`/subscriptions/${subscription!.id}`, body)
        : await api.post<Subscription>("/subscriptions", {
            ...body,
            template_id: values.template_id ? Number(values.template_id) : null,
            discount_id: values.discount_id ? Number(values.discount_id) : null,
          } satisfies Body<"SubscriptionCreateIn">);
      toast.success(editing ? "Changes saved" : `${saved.number} created as a draft`);
      router.push(`/console/subscriptions/${saved.id}`);
      router.refresh();
    } catch (error) {
      applyServerErrors(error, form.setError, {
        fields: ["customer_id", "plan_id", "plan_quantity", "start_date", "term_periods", "payment_term_id", "discount_id", "notes", "template_id"],
      });
    }
  }

  const unit = plan ? BILLING_PERIOD_UNIT[plan.billing_period] : "period";

  return (
    <form onSubmit={singleFlight(form.handleSubmit(onSubmit))} noValidate className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Section title="Customer & plan">
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="customer_id"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined} className="sm:col-span-2">
                  <FieldLabel htmlFor="customer-picker">
                    Customer<span className="text-destructive" aria-hidden>*</span>
                  </FieldLabel>
                  <EntityCombobox<Customer>
                    id="customer-picker"
                    resource="customers"
                    path="/customers"
                    params={{ is_active: true }}
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    getLabel={(c) => (c.company_name ? `${c.name} — ${c.company_name}` : c.name)}
                    getDescription={(c) => c.email}
                    selectedLabel={subscription?.customer.name ?? initialCustomer.data?.name ?? null}
                    placeholder="Search customers…"
                    searchPlaceholder="Name, email or company"
                    invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            {!editing ? (
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="template-select">Start from a quotation template</FieldLabel>
                <Select
                  value={templateId || "none"}
                  onValueChange={(v) => void applyTemplate(v === "none" ? "" : v)}
                >
                  <SelectTrigger id="template-select" className="h-9 w-full bg-background">
                    <SelectValue placeholder="No template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template — build from scratch</SelectItem>
                    {(templates.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name} (valid {t.validity_days} days)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {templates.error instanceof ApiError && templates.error.isUnavailable ? (
                  <p className="text-xs text-muted-foreground">Quotation templates are not available on this server yet.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Fills in the plan, product lines and validity for you.</p>
                )}
              </Field>
            ) : null}
            <SelectField
              control={form.control}
              name="plan_id"
              label="Plan"
              required
              className="sm:col-span-2"
              placeholder={plans.isPending ? "Loading plans…" : "Choose a plan"}
              options={[
                ...(plans.data ?? []).map(planOption),
                ...(subscription && !plans.data?.some((p) => p.id === subscription.plan.id)
                  ? [{ value: String(subscription.plan.id), label: subscription.plan.name }]
                  : []),
              ]}
            />
            <NumberField
              control={form.control}
              name="plan_quantity"
              label="Seats"
              required
              description={plan ? `Minimum ${plan.min_quantity} for this plan` : undefined}
            />
            <NumberField
              control={form.control}
              name="term_periods"
              label={`Term (${unit}s)`}
              required
              description="Sets the expiry date from the start date."
            />
            <TextField control={form.control} name="start_date" label="Start date" type="date" required />
            <SelectField
              control={form.control}
              name="payment_term_id"
              label="Payment terms"
              required
              options={(terms.data ?? []).map(termOption)}
            />
            {!editing ? (
              <SelectField
                control={form.control}
                name="discount_id"
                label="Discount"
                allowEmpty
                emptyLabel="No discount"
                className="sm:col-span-2"
                options={(discounts.data ?? []).map((d) => ({
                  value: String(d.id),
                  label: `${d.name} — ${d.kind === "percentage" ? formatRate(d.value) : formatMoney(d.value)} off`,
                }))}
                description="Applied automatically to every invoice while the rule is valid."
              />
            ) : null}
          </div>
        </Section>

        <Section
          title="Add-on products"
          description="Optional products billed with the plan each period. Unit price defaults to the product price plus the variant's extra price."
          actions={
            <Button type="button" size="sm" variant="outline" onClick={() => lines.append({ product_id: "", variant_id: "", quantity: "1", unit_price: "" })}>
              <Plus /> Add product
            </Button>
          }
        >
          {lines.fields.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No add-on products. The plan seats are billed on their own.</p>
          ) : (
            <ul className="space-y-3">
              {lines.fields.map((field, index) => (
                <ProductLineRow
                  key={field.id}
                  index={index}
                  control={form.control as unknown as Control<LinesForm>}
                  products={(products.data ?? []).map((p) => ({ value: String(p.id), label: `${p.name} (${formatMoney(p.sales_price)})` }))}
                  onRemove={() => lines.remove(index)}
                  onProductChange={() => form.setValue(`lines.${index}.variant_id`, "")}
                />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Notes">
          <TextareaField control={form.control} name="notes" label="Internal notes" rows={3} />
        </Section>
      </div>

      <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <PricePreview preview={preview.data} isFetching={preview.isFetching} error={preview.error} ready={debouncedBody !== null} unit={unit} />
        <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
          <Button type="submit" size="lg" className="h-10 w-full sm:flex-1 xl:flex-none" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
            {editing ? "Save changes" : "Create draft"}
          </Button>
          <Button type="button" variant="outline" size="lg" className="h-10 w-full sm:flex-1 xl:flex-none" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {editing
            ? "Drafts and quotations can be edited until they are confirmed."
            : "The subscription is saved as a draft. Send it as a quotation or confirm it from the next screen."}
        </p>
      </div>
    </form>
  );
}

function PricePreview({
  preview,
  isFetching,
  error,
  ready,
  unit,
}: {
  preview: PricingPreview | undefined;
  isFetching: boolean;
  error: unknown;
  ready: boolean;
  unit: string;
}) {
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          Price per {unit} {isFetching ? <InlineSpinner /> : null}
        </span>
      }
      description="Calculated by the billing engine, including taxes and discounts."
      contentClassName="p-0"
    >
      <div aria-live="polite">
        {!ready ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Choose a plan and the number of seats to see the price.</p>
        ) : error && !preview ? (
          <div className="px-5 py-4">
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{errorMessage(error)}</AlertDescription>
            </Alert>
          </div>
        ) : preview ? (
          <>
            <div className="relative overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" tabIndex={0} role="region" aria-label="Price breakdown">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5">Line</TableHead>
                  <TableHead className="pr-5 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.lines.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-5">
                      <p className="text-sm font-medium">{line.description}</p>
                      <p className="tabular text-xs text-muted-foreground">
                        {line.quantity} × {formatMoney(line.unit_price)}
                        {line.tax ? ` · ${line.tax.name}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="tabular pr-5 text-right text-sm">{formatMoney(line.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-transparent">
                <TotalsRows totals={preview} colSpan={1} />
              </TableFooter>
            </Table>
            </div>
            {preview.discount_skipped_reason ? (
              <p className="flex items-start gap-2 border-t px-5 py-3 text-xs text-amber-800">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Discount not applied: {preview.discount_skipped_reason}
              </p>
            ) : null}
          </>
        ) : (
          <p className="px-5 py-6 text-sm text-muted-foreground">Calculating…</p>
        )}
      </div>
    </Section>
  );
}
