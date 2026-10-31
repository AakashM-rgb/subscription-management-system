"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormDialog } from "@/components/form-dialog";
import { applyServerErrors, SwitchField, TextareaField, TextField } from "@/components/form-fields";
import { api } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import { useApiMutation } from "@/lib/api/hooks";
import type { Customer } from "@/lib/api/types";
import { emailSchema, toNullable } from "@/lib/validation";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  email: emailSchema,
  phone: z.string().trim().max(32),
  company_name: z.string().trim().max(160),
  address: z.string().trim().max(2000),
  tax_id: z.string().trim().max(32),
  is_active: z.boolean(),
});
type Values = z.infer<typeof schema>;

function toValues(customer?: Customer | null): Values {
  return {
    name: customer?.name ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    company_name: customer?.company_name ?? "",
    address: customer?.address ?? "",
    tax_id: customer?.tax_id ?? "",
    is_active: customer?.is_active ?? true,
  };
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  onSaved?: (customer: Customer) => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(customer) });
  useEffect(() => {
    if (open) form.reset(toValues(customer));
  }, [open, customer, form]);

  const mutation = useApiMutation<Values, Customer>({
    mutationFn: (values) => {
      const body = {
        name: values.name,
        email: values.email,
        phone: toNullable(values.phone),
        company_name: toNullable(values.company_name),
        address: toNullable(values.address),
        tax_id: toNullable(values.tax_id),
      } satisfies Body<"CustomerCreateIn">;
      return customer
        ? api.patch<Customer>(`/customers/${customer.id}`, { ...body, is_active: values.is_active } satisfies Body<"CustomerUpdateIn">)
        : api.post<Customer>("/customers", body);
    },
    invalidate: ["customers"],
    success: customer ? "Customer updated" : "Customer created",
    toastError: false,
    onSuccess: (saved) => {
      onOpenChange(false);
      onSaved?.(saved);
    },
  });

  const onSubmit = form.handleSubmit((values) =>
    mutation.mutateAsync(values).catch((error) =>
      applyServerErrors(error, form.setError, { fields: Object.keys(values), duplicateField: "email" }),
    ),
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={customer ? "Edit customer" : "New customer"}
      description="Billing details are copied onto each invoice when it is issued."
      onSubmit={onSubmit}
      pending={mutation.isPending}
      submitLabel={customer ? "Save changes" : "Create customer"}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="name" label="Contact name" required />
        <TextField control={form.control} name="email" label="Billing email" type="email" required />
        <TextField control={form.control} name="company_name" label="Company" />
        <TextField control={form.control} name="phone" label="Phone" type="tel" />
        <TextField control={form.control} name="tax_id" label="Tax ID (GSTIN)" />
      </div>
      <TextareaField control={form.control} name="address" label="Billing address" rows={3} />
      {customer ? (
        <SwitchField
          control={form.control}
          name="is_active"
          label="Active customer"
          description="Inactive customers cannot be selected for new subscriptions."
        />
      ) : null}
    </FormDialog>
  );
}
