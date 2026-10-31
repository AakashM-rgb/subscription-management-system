"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorState, PageSkeleton } from "@/components/feedback";
import { applyServerErrors, TextareaField, TextField } from "@/components/form-fields";
import { PageHeader, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ChangePasswordSection } from "@/features/account/change-password";
import { PaymentMethodsSection } from "@/features/portal/payment-methods";
import { api } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import { useApiMutation, useResource } from "@/lib/api/hooks";
import type { PortalProfile } from "@/lib/api/types";
import { toNullable } from "@/lib/validation";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  phone: z.string().trim().max(32),
  company_name: z.string().trim().max(160),
  address: z.string().trim().max(1000),
  tax_id: z.string().trim().max(32),
});
type Values = z.infer<typeof schema>;

export default function PortalProfilePage() {
  const profile = useResource<PortalProfile>(["portal", "profile"], "/portal/profile");
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", phone: "", company_name: "", address: "", tax_id: "" } });
  useEffect(() => {
    if (profile.data)
      form.reset({
        name: profile.data.name,
        phone: profile.data.phone ?? "",
        company_name: profile.data.company_name ?? "",
        address: profile.data.address ?? "",
        tax_id: profile.data.tax_id ?? "",
      });
  }, [profile.data, form]);

  const save = useApiMutation<Values, PortalProfile>({
    mutationFn: (v) =>
      api.patch<PortalProfile>("/portal/profile", {
        name: v.name,
        phone: toNullable(v.phone),
        company_name: toNullable(v.company_name),
        address: toNullable(v.address),
        tax_id: toNullable(v.tax_id),
      } satisfies Body<"ProfileUpdateIn">),
    invalidate: ["portal"],
    success: "Profile saved. New invoices will use these details.",
    toastError: false,
  });

  if (profile.isPending) return <PageSkeleton />;
  if (profile.error) return <ErrorState error={profile.error} onRetry={() => profile.refetch()} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Profile" description="Your billing details, automatic payments and password." />
      <Section title="Billing details" description="Copied onto each new invoice. Invoices already issued keep the details they were issued with.">
        <form
          noValidate
          onSubmit={form.handleSubmit((v) => save.mutateAsync(v).catch((e) => applyServerErrors(e, form.setError, { fields: Object.keys(v) })))}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="name" label="Name" required />
            <Field>
              <FieldLabel htmlFor="profile-email">Email</FieldLabel>
              <Input id="profile-email" value={profile.data.email ?? ""} readOnly disabled className="h-9" />
              <FieldDescription>Contact us to change your sign-in email.</FieldDescription>
            </Field>
            <TextField control={form.control} name="company_name" label="Company" />
            <TextField control={form.control} name="phone" label="Phone" type="tel" description="Needed for UPI and card autopay." />
            <TextField control={form.control} name="tax_id" label="Tax ID (GSTIN)" />
          </div>
          <TextareaField control={form.control} name="address" label="Billing address" />
          <Button type="submit" disabled={save.isPending || !form.formState.isDirty} aria-busy={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            Save details
          </Button>
        </form>
      </Section>
      <PaymentMethodsSection />
      <ChangePasswordSection />
    </div>
  );
}
