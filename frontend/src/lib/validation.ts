import { z } from "zod";

/** Official rule: more than eight characters, an uppercase letter, a lowercase letter and a special character. */
export const PASSWORD_RULES = [
  { id: "length", label: "More than 8 characters", test: (p: string) => p.length > 8 },
  { id: "upper", label: "An uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower", label: "A lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { id: "special", label: "A special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export const passwordSchema = z
  .string()
  .max(128, "Password must be at most 128 characters")
  .superRefine((value, ctx) => {
    const failed = PASSWORD_RULES.filter((rule) => !rule.test(value));
    if (failed.length) {
      ctx.addIssue({
        code: "custom",
        message: `Password needs: ${failed.map((rule) => rule.label.toLowerCase()).join(", ")}`,
      });
    }
  });

export const emailSchema = z.string().trim().min(1, "Email is required").email("Enter a valid email address");

/** Money inputs stay strings end-to-end; only format is validated here. */
export const moneyString = (label = "Amount") =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d{1,12}(\.\d{1,2})?$/, `${label} must be a number with up to 2 decimals`);

export const optionalMoneyString = (label = "Amount") =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{1,12}(\.\d{1,2})?$/.test(v), `${label} must be a number with up to 2 decimals`);

export const positiveMoneyString = (label = "Amount") =>
  moneyString(label).refine((v) => Number(v) > 0, `${label} must be greater than zero`);

export const intString = (label: string, min = 0) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d+$/, `${label} must be a whole number`)
    .refine((v) => Number(v) >= min, `${label} must be at least ${min}`);

export const optionalIntString = (label: string, min = 0) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= min), `${label} must be a whole number of at least ${min}`);

export const rateString = z
  .string()
  .trim()
  .min(1, "Rate is required")
  .regex(/^\d{1,3}(\.\d{1,3})?$/, "Rate must be a number with up to 3 decimals")
  .refine((v) => Number(v) <= 100, "Rate cannot exceed 100%");

export const dateString = (label = "Date") =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} is required`);

export const optionalDateString = z.string().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Invalid date");

export const idString = (label: string) => z.string().min(1, `Select a ${label}`).regex(/^\d+$/, `Select a ${label}`);

export function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function toIntOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}
