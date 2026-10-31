"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { PasswordChecklist } from "@/components/auth/password-checklist";
import { applyServerErrors, TextField } from "@/components/form-fields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { api, ApiError, errorMessage } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import type { Me } from "@/lib/api/types";
import { safeNextPath } from "@/lib/permissions";
import { emailSchema, passwordSchema } from "@/lib/validation";

function AuthHeading({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <div className="mb-6 space-y-1.5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" size="lg" className="h-10 w-full" disabled={pending} aria-busy={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

// ---------------------------------------------------------------- login

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    setFormError(null);
    try {
      const me = await api.post<Me>("/auth/login", { ...values } satisfies Body<"LoginIn">);
      router.replace(safeNextPath(params.get("next"), me.role));
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.code === "INVALID_CREDENTIALS"
          ? "The email or password is incorrect."
          : errorMessage(error),
      );
    }
  }

  return (
    <>
      <AuthHeading title="Sign in" description="Welcome back. Sign in to manage subscriptions and billing." />
      {params.get("expired") ? (
        <Alert className="mb-4">
          <AlertCircle />
          <AlertTitle>Session ended</AlertTitle>
          <AlertDescription>Your session expired. Please sign in again.</AlertDescription>
        </Alert>
      ) : null}
      {params.get("reset") ? (
        <Alert className="mb-4">
          <CheckCircle2 />
          <AlertTitle>Password updated</AlertTitle>
          <AlertDescription>You can now sign in with your new password.</AlertDescription>
        </Alert>
      ) : null}
      {formError ? (
        <Alert variant="destructive" className="mb-4" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" required />
          <div className="space-y-1">
            <TextField
              control={form.control}
              name="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              required
            />
            <div className="text-right">
              <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
          </div>
          <SubmitButton pending={form.formState.isSubmitting}>Sign in</SubmitButton>
        </FieldGroup>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Brightloop?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

// ---------------------------------------------------------------- signup

const signupSchema = z
  .object({
    full_name: z.string().trim().min(1, "Your name is required").max(120),
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export function SignupForm() {
  const router = useRouter();
  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { full_name: "", email: "", password: "", confirm: "" },
    mode: "onTouched",
  });
  const password = useWatch({ control: form.control, name: "password" });

  async function onSubmit({ full_name, email, password: pw }: z.infer<typeof signupSchema>) {
    try {
      await api.post<Me>("/auth/signup", { full_name, email, password: pw } satisfies Body<"SignupIn">);
      router.replace("/portal");
      router.refresh();
    } catch (error) {
      applyServerErrors(error, form.setError, {
        fields: ["full_name", "email", "password"],
        duplicateField: "email",
      });
    }
  }

  return (
    <>
      <AuthHeading
        title="Create your account"
        description="See and manage your subscriptions and invoices without emailing anyone."
      />
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <TextField control={form.control} name="full_name" label="Full name" autoComplete="name" required />
          <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" required />
          <div className="space-y-2">
            <TextField
              control={form.control}
              name="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              required
            />
            <PasswordChecklist value={password ?? ""} />
          </div>
          <TextField
            control={form.control}
            name="confirm"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
          />
          <SubmitButton pending={form.formState.isSubmitting}>Create account</SubmitButton>
        </FieldGroup>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

// ---------------------------------------------------------------- forgot password

const forgotSchema = z.object({ email: emailSchema });

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const form = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit({ email }: z.infer<typeof forgotSchema>) {
    try {
      await api.post("/auth/password/forgot", { email } satisfies Body<"ForgotPasswordIn">);
      setSentTo(email);
    } catch (error) {
      if (error instanceof ApiError && error.isUnavailable) setUnavailable(true);
      else applyServerErrors(error, form.setError, { fields: ["email"] });
    }
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <MailCheck className="size-6" aria-hidden />
        </div>
        <AuthHeading
          title="Check your email"
          description={
            <>
              If an account exists for <strong className="text-foreground">{sentTo}</strong>, a password reset link is on
              its way. The link expires after a short time.
            </>
          }
        />
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <AuthHeading title="Reset your password" description="Enter your account email and we'll send you a reset link." />
      {unavailable ? (
        <Alert className="mb-4">
          <AlertCircle />
          <AlertTitle>Not available yet</AlertTitle>
          <AlertDescription>
            Password reset is not enabled on this server yet. Please contact your administrator.
          </AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" required />
          <SubmitButton pending={form.formState.isSubmitting}>Send reset link</SubmitButton>
        </FieldGroup>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

// ---------------------------------------------------------------- reset password / accept invite

const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export function SetPasswordForm({ mode }: { mode: "reset" | "invite" }) {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const form = useForm<z.infer<typeof newPasswordSchema>>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirm: "" },
    mode: "onTouched",
  });
  const password = useWatch({ control: form.control, name: "password" });
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit({ password: pw }: z.infer<typeof newPasswordSchema>) {
    setFormError(null);
    try {
      if (mode === "reset") {
        await api.post("/auth/password/reset", { token, password: pw } satisfies Body<"ResetPasswordIn">);
        router.replace("/login?reset=1");
      } else {
        const me = await api.post<Me>("/auth/invite/accept", { token, password: pw });
        router.replace(safeNextPath(null, me.role));
        router.refresh();
      }
    } catch (error) {
      if (error instanceof ApiError && (error.code === "INVALID_TOKEN" || error.status === 400 || error.status === 410)) {
        setFormError("This link is invalid or has expired. Request a new one.");
      } else if (error instanceof ApiError && error.isUnavailable) {
        setFormError("This feature is not enabled on the server yet. Please contact your administrator.");
      } else {
        applyServerErrors(error, form.setError, { fields: ["password"] });
      }
    }
  }

  const title = mode === "reset" ? "Choose a new password" : "Set up your account";
  const description =
    mode === "reset" ? "Your new password replaces the old one on all devices." : "Choose a password to finish setting up your access.";

  if (!token) {
    return (
      <>
        <AuthHeading title={title} description="This page needs the link from your email." />
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>The link is missing its token. Open the link from your email again.</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4 w-full">
          <Link href={mode === "reset" ? "/forgot-password" : "/login"}>
            {mode === "reset" ? "Request a new link" : "Back to sign in"}
          </Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <AuthHeading title={title} description={description} />
      {formError ? (
        <Alert variant="destructive" className="mb-4" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <div className="space-y-2">
            <TextField
              control={form.control}
              name="password"
              label="New password"
              type="password"
              autoComplete="new-password"
              required
            />
            <PasswordChecklist value={password ?? ""} />
          </div>
          <TextField
            control={form.control}
            name="confirm"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
          />
          <SubmitButton pending={form.formState.isSubmitting}>
            {mode === "reset" ? "Update password" : "Activate account"}
          </SubmitButton>
        </FieldGroup>
      </form>
    </>
  );
}
