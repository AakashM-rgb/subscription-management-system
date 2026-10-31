"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { PasswordChecklist } from "@/components/auth/password-checklist";
import { applyServerErrors, TextField } from "@/components/form-fields";
import { Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import { passwordSchema } from "@/lib/validation";

const schema = z
  .object({
    current_password: z.string().min(1, "Enter your current password"),
    new_password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { message: "Passwords do not match", path: ["confirm"] })
  .refine((v) => v.new_password !== v.current_password, { message: "Choose a password you haven't used here", path: ["new_password"] });
type Values = z.infer<typeof schema>;

export function ChangePasswordSection() {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: "", new_password: "", confirm: "" },
    mode: "onTouched",
  });
  const password = useWatch({ control: form.control, name: "new_password" });

  async function onSubmit(v: Values) {
    try {
      await api.post("/auth/password/change", { current_password: v.current_password, new_password: v.new_password } satisfies Body<"ChangePasswordIn">);
      form.reset();
      toast.success("Password changed. Other devices have been signed out.");
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") {
        form.setError("current_password", { message: "Current password is incorrect" });
        return;
      }
      applyServerErrors(error, form.setError, { fields: ["current_password", "new_password"] });
    }
  }

  return (
    <Section title="Change password" description="Changing your password signs you out on every other device.">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="max-w-md">
        <FieldGroup className="gap-4">
          <TextField control={form.control} name="current_password" label="Current password" type="password" autoComplete="current-password" required />
          <div className="space-y-2">
            <TextField control={form.control} name="new_password" label="New password" type="password" autoComplete="new-password" required />
            <PasswordChecklist value={password ?? ""} />
          </div>
          <TextField control={form.control} name="confirm" label="Confirm new password" type="password" autoComplete="new-password" required />
          <div>
            <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Update password
            </Button>
          </div>
        </FieldGroup>
      </form>
    </Section>
  );
}
