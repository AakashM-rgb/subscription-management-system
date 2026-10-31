"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { applyServerErrors, NumberField, SelectField, SwitchField, TextareaField, TextField } from "@/components/form-fields";
import { Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ProductLineRow, type LinesForm } from "@/features/subscriptions/line-row";
import { api } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import { planOption, termOption, usePaymentTermOptions, usePlanOptions, useProductOptions } from "@/lib/api/reference";
import type { QuotationTemplate } from "@/lib/api/types";
import { BILLING_PERIOD_UNIT, formatMoney } from "@/lib/format";
import { idString, intString, optionalMoneyString } from "@/lib/validation";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  plan_id: idString("plan"),
  plan_quantity: intString("Seats", 1),
  payment_term_id: z.string(),
  term_periods: intString("Term", 1),
  validity_days: intString("Validity", 1).refine((v) => Number(v) <= 365, "Validity cannot exceed 365 days"),
  notes: z.string().max(5000),
  is_active: z.boolean(),
  lines: z.array(
    z.object({
      product_id: idString("product"),
      variant_id: z.string(),
      quantity: intString("Quantity", 1),
      unit_price: optionalMoneyString("Unit price"),
    }),
  ),
});
type Values = z.infer<typeof schema>;

function toValues(t?: QuotationTemplate | null): Values {
  return {
    name: t?.name ?? "",
    plan_id: t ? String(t.plan_id) : "",
    plan_quantity: String(t?.plan_quantity ?? 1),
    payment_term_id: t?.payment_term_id ? String(t.payment_term_id) : "",
    term_periods: String(t?.term_periods ?? 12),
    validity_days: String(t?.validity_days ?? 30),
    notes: t?.notes ?? "",
    is_active: t?.is_active ?? true,
    lines: (t?.lines ?? []).map((l) => ({
      product_id: String(l.product_id),
      variant_id: l.variant_id ? String(l.variant_id) : "",
      quantity: String(l.quantity),
      unit_price: l.unit_price ?? "",
    })),
  };
}

export function TemplateForm({ template }: { template?: QuotationTemplate | null }) {
  const router = useRouter();
  const plans = usePlanOptions();
  const terms = usePaymentTermOptions();
  const products = useProductOptions();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(template) });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const planId = useWatch({ control: form.control, name: "plan_id" });
  const plan = plans.data?.find((p) => String(p.id) === planId);

  async function onSubmit(v: Values) {
    const body = {
      name: v.name,
      plan_id: Number(v.plan_id),
      plan_quantity: Number(v.plan_quantity),
      payment_term_id: v.payment_term_id ? Number(v.payment_term_id) : null,
      term_periods: Number(v.term_periods),
      validity_days: Number(v.validity_days),
      notes: v.notes.trim() || null,
      lines: v.lines.map((l) => ({
        product_id: Number(l.product_id),
        variant_id: l.variant_id ? Number(l.variant_id) : null,
        quantity: Number(l.quantity),
        unit_price: l.unit_price || null,
      })),
    } satisfies Body<"TemplateCreateIn">;
    try {
      if (template) await api.patch(`/quotation-templates/${template.id}`, { ...body, is_active: v.is_active } satisfies Body<"TemplateUpdateIn">);
      else await api.post("/quotation-templates", body);
      toast.success(template ? "Template saved" : "Template created");
      router.push("/console/quotation-templates");
      router.refresh();
    } catch (error) {
      applyServerErrors(error, form.setError, {
        fields: ["name", "plan_id", "plan_quantity", "payment_term_id", "term_periods", "validity_days", "notes"],
        duplicateField: "name",
      });
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <Section title="Template">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="name" label="Template name" required className="sm:col-span-2" placeholder="Enterprise yearly — 50 seats" />
          <SelectField control={form.control} name="plan_id" label="Plan" required className="sm:col-span-2" options={(plans.data ?? []).map(planOption)} />
          <NumberField control={form.control} name="plan_quantity" label="Seats" required description={plan ? `Minimum ${plan.min_quantity}` : undefined} />
          <NumberField
            control={form.control}
            name="term_periods"
            label={`Term (${plan ? BILLING_PERIOD_UNIT[plan.billing_period] : "period"}s)`}
            required
          />
          <NumberField control={form.control} name="validity_days" label="Quotation valid for (days)" required description="How long the customer has to accept." />
          <SelectField
            control={form.control}
            name="payment_term_id"
            label="Payment terms"
            allowEmpty
            emptyLabel="Choose when quoting"
            options={(terms.data ?? []).map(termOption)}
          />
        </div>
        <div className="mt-4 space-y-4">
          <TextareaField control={form.control} name="notes" label="Notes copied onto quotations" rows={3} />
          {template ? <SwitchField control={form.control} name="is_active" label="Template active" description="Inactive templates are hidden when creating quotations." /> : null}
        </div>
      </Section>
      <Section
        title="Product lines"
        description="Add-on products that are pre-filled on every quotation made from this template."
        actions={
          <Button type="button" size="sm" variant="outline" onClick={() => lines.append({ product_id: "", variant_id: "", quantity: "1", unit_price: "" })}>
            <Plus /> Add product
          </Button>
        }
      >
        {lines.fields.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No product lines. Quotations will include only the plan seats.</p>
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
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {template ? "Save template" : "Create template"}
        </Button>
      </div>
    </form>
  );
}
