"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { EntityCombobox } from "@/components/entity-combobox";
import { FormDialog } from "@/components/form-dialog";
import { applyServerErrors, MoneyField, SelectField, TextareaField, TextField } from "@/components/form-fields";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { PAYMENT_METHOD_LABEL } from "@/features/columns";
import { api, ApiError } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/hooks";
import type { InvoiceListItem, Payment, PaymentMethod } from "@/lib/api/types";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { dateString, idString, positiveMoneyString } from "@/lib/validation";

const schema = z
  .object({
    invoice_id: idString("invoice"),
    method: z.enum(["cash", "bank_transfer", "card", "upi", "cheque", "other"]),
    amount: positiveMoneyString("Amount"),
    payment_date: dateString("Payment date"),
    note: z.string().max(2000),
  })
  .refine((v) => v.payment_date <= todayISO(), { message: "Payment date cannot be in the future", path: ["payment_date"] });
type Values = z.infer<typeof schema>;

function newKey(): string {
  return crypto.randomUUID();
}

/**
 * Records a manual payment against a confirmed invoice. Each dialog session sends one
 * Idempotency-Key, so a retry after a timeout or a double submit never records the payment twice.
 */
type FixedInvoice = Pick<InvoiceListItem, "id" | "number" | "bill_to_name" | "amount_due" | "currency" | "due_date">;

export function RecordPaymentDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When given, the invoice is fixed; otherwise the user searches outstanding invoices. */
  invoice?: FixedInvoice | null;
}) {
  // Mounting the form on open gives every dialog session fresh values and a fresh idempotency key.
  return props.open ? <RecordPaymentForm {...props} /> : null;
}

function RecordPaymentForm({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: FixedInvoice | null;
}) {
  const [key, setKey] = useState(newKey);
  const [picked, setPicked] = useState<InvoiceListItem | null>(null);
  const target = invoice ?? picked;
  const defaults = (): Values => ({
    invoice_id: invoice ? String(invoice.id) : "",
    method: "bank_transfer",
    amount: invoice ? invoice.amount_due : "",
    payment_date: todayISO(),
    note: "",
  });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults() });

  const mutation = useApiMutation<Values, Payment>({
    mutationFn: (v) =>
      api.post<Payment>(
        "/payments",
        { invoice_id: Number(v.invoice_id), method: v.method, amount: v.amount, payment_date: v.payment_date, note: v.note.trim() || null },
        { "Idempotency-Key": key },
      ),
    invalidate: ["invoices", "payments", "reports", "customers", "subscriptions"],
    success: (p) => `Payment ${p.number} recorded`,
    toastError: false,
    onSuccess: () => onOpenChange(false),
  });

  async function onSubmit(v: Values) {
    if (target && Number(v.amount) > Number(target.amount_due)) {
      form.setError("amount", { message: `Cannot exceed the amount due (${formatMoney(target.amount_due, target.currency)})` });
      return;
    }
    try {
      await mutation.mutateAsync(v);
    } catch (error) {
      if (error instanceof ApiError && error.code === "AMOUNT_EXCEEDS_DUE") {
        const due = (error.details as { amount_due?: string } | null)?.amount_due;
        form.setError("amount", { message: due ? `Cannot exceed the amount due (${formatMoney(due)})` : error.message });
        return;
      }
      if (error instanceof ApiError && error.code === "DUPLICATE") {
        // The key was already used for a different payment: start a fresh attempt.
        setKey(newKey());
      }
      applyServerErrors(error, form.setError, { fields: ["invoice_id", "method", "amount", "payment_date", "note"] });
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record payment"
      description={
        target ? (
          <>
            Against <strong className="text-foreground">{target.number ?? `invoice #${target.id}`}</strong> for {target.bill_to_name} ·{" "}
            {formatMoney(target.amount_due, target.currency)} due {formatDate(target.due_date)}
          </>
        ) : (
          "Choose the invoice this payment settles. Only confirmed, unpaid invoices can take payments."
        )
      }
      onSubmit={form.handleSubmit(onSubmit)}
      pending={mutation.isPending}
      submitLabel="Record payment"
    >
      {!invoice ? (
        <Controller
          control={form.control}
          name="invoice_id"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="payment-invoice">
                Invoice<span className="text-destructive" aria-hidden>*</span>
              </FieldLabel>
              <EntityCombobox<InvoiceListItem>
                id="payment-invoice"
                resource="invoices"
                path="/invoices"
                params={{ status: "confirmed" }}
                value={field.value}
                onChange={(value, item) => {
                  field.onChange(value);
                  setPicked(item);
                  if (item) form.setValue("amount", item.amount_due, { shouldValidate: true });
                }}
                getLabel={(i) => `${i.number ?? `#${i.id}`} — ${i.bill_to_name}`}
                getDescription={(i) => `${formatMoney(i.amount_due, i.currency)} due ${formatDate(i.due_date)}${i.is_overdue ? " · overdue" : ""}`}
                placeholder="Search confirmed invoices…"
                searchPlaceholder="Invoice number or customer"
                invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField control={form.control} name="amount" label="Amount" required />
        <SelectField
          control={form.control}
          name="method"
          label="Method"
          required
          options={(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))}
        />
        <TextField control={form.control} name="payment_date" label="Payment date" type="date" required />
      </div>
      <TextareaField control={form.control} name="note" label="Note" rows={2} placeholder="Bank reference, cheque number…" />
    </FormDialog>
  );
}
