"use client";

import type { ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type UseFormSetError,
} from "react-hook-form";
import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

function Label({ htmlFor, label, required }: { htmlFor: string; label: string; required?: boolean }) {
  return (
    <FieldLabel htmlFor={htmlFor}>
      {label}
      {required ? (
        <span className="text-destructive" aria-hidden>
          *
        </span>
      ) : null}
    </FieldLabel>
  );
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  type = "text",
  placeholder,
  autoComplete,
  prefix,
  inputMode,
}: BaseProps<T> & {
  type?: "text" | "email" | "password" | "date" | "number" | "tel";
  placeholder?: string;
  autoComplete?: string;
  prefix?: string;
  inputMode?: "decimal" | "numeric" | "text" | "email" | "tel";
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const id = `field-${name}`;
        const descId = description ? `${id}-desc` : undefined;
        return (
          <Field data-invalid={fieldState.invalid || undefined} className={className}>
            <Label htmlFor={id} label={label} required={required} />
            <div className="relative">
              {prefix ? (
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                  {prefix}
                </span>
              ) : null}
              <Input
                {...field}
                value={(field.value as string | undefined) ?? ""}
                id={id}
                type={type}
                placeholder={placeholder}
                autoComplete={autoComplete}
                inputMode={inputMode}
                disabled={disabled}
                aria-invalid={fieldState.invalid || undefined}
                aria-required={required || undefined}
                aria-describedby={cn(descId, fieldState.error && `${id}-error`) || undefined}
                className={cn("h-9 bg-background", prefix && "pl-7", (inputMode === "decimal" || inputMode === "numeric") && "tabular")}
              />
            </div>
            {description ? <FieldDescription id={descId}>{description}</FieldDescription> : null}
            <FieldError id={`${id}-error`} errors={[fieldState.error]} />
          </Field>
        );
      }}
    />
  );
}

export function MoneyField<T extends FieldValues>(props: BaseProps<T> & { placeholder?: string }) {
  return <TextField {...props} inputMode="decimal" prefix="₹" placeholder={props.placeholder ?? "0.00"} />;
}

export function NumberField<T extends FieldValues>(props: BaseProps<T> & { placeholder?: string }) {
  return <TextField {...props} inputMode="numeric" />;
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  rows = 3,
  placeholder,
}: BaseProps<T> & { rows?: number; placeholder?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const id = `field-${name}`;
        return (
          <Field data-invalid={fieldState.invalid || undefined} className={className}>
            <Label htmlFor={id} label={label} required={required} />
            <Textarea
              {...field}
              value={(field.value as string | undefined) ?? ""}
              id={id}
              rows={rows}
              placeholder={placeholder}
              disabled={disabled}
              aria-invalid={fieldState.invalid || undefined}
              className="bg-background"
            />
            {description ? <FieldDescription>{description}</FieldDescription> : null}
            <FieldError errors={[fieldState.error]} />
          </Field>
        );
      }}
    />
  );
}

const NONE = "__none__";

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  options,
  placeholder = "Select…",
  allowEmpty,
  emptyLabel = "None",
}: BaseProps<T> & {
  options: { value: string; label: string; description?: string }[];
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const id = `field-${name}`;
        const value = (field.value as string | undefined) ?? "";
        return (
          <Field data-invalid={fieldState.invalid || undefined} className={className}>
            <Label htmlFor={id} label={label} required={required} />
            <Select
              value={value === "" ? (allowEmpty ? NONE : "") : value}
              onValueChange={(next) => field.onChange(next === NONE ? "" : next)}
              disabled={disabled}
            >
              <SelectTrigger
                id={id}
                ref={field.ref}
                onBlur={field.onBlur}
                aria-invalid={fieldState.invalid || undefined}
                className="h-9 w-full bg-background"
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                {allowEmpty ? <SelectItem value={NONE}>{emptyLabel}</SelectItem> : null}
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {description ? <FieldDescription>{description}</FieldDescription> : null}
            <FieldError errors={[fieldState.error]} />
          </Field>
        );
      }}
    />
  );
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
  className,
}: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const id = `field-${name}`;
        return (
          <Field orientation="horizontal" className={cn("items-start rounded-lg border bg-background p-3", className)}>
            <Switch
              id={id}
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              disabled={disabled}
              aria-describedby={description ? `${id}-desc` : undefined}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <FieldLabel htmlFor={id} className="font-medium">
                {label}
              </FieldLabel>
              {description ? (
                <FieldDescription id={`${id}-desc`} className="text-xs">
                  {description}
                </FieldDescription>
              ) : null}
            </div>
          </Field>
        );
      }}
    />
  );
}

/**
 * Maps a backend error onto form fields (422 details by body path, 409 DUPLICATE by field hint)
 * and toasts anything that does not belong to a single field.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  options: { fields?: string[]; fieldMap?: Record<string, string>; duplicateField?: string } = {},
) {
  if (error instanceof ApiError) {
    const fieldErrors = error.fieldErrors;
    let mapped = false;
    for (const [path, message] of Object.entries(fieldErrors)) {
      const target = options.fieldMap?.[path] ?? path;
      if (!options.fields || options.fields.includes(target)) {
        setError(target as FieldPath<T>, { type: "server", message });
        mapped = true;
      }
    }
    if (error.code === "DUPLICATE" && options.duplicateField) {
      setError(options.duplicateField as FieldPath<T>, { type: "server", message: error.message });
      return;
    }
    if (mapped) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
  }
  toast.error(errorMessage(error));
}
