"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormDialog } from "@/components/form-dialog";
import { applyServerErrors, MoneyField, SelectField, SwitchField, TextareaField, TextField } from "@/components/form-fields";
import { api } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/hooks";
import { taxOption, useTaxOptions } from "@/lib/api/reference";
import type { ProductDetail, ProductVariant } from "@/lib/api/types";
import { moneyString, toNullable } from "@/lib/validation";

const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  product_type: z.enum(["service", "goods"]),
  sales_price: moneyString("Sales price"),
  cost_price: moneyString("Cost price"),
  tax_id: z.string(),
  notes: z.string().max(5000),
  is_active: z.boolean(),
});
type ProductValues = z.infer<typeof productSchema>;

function productValues(product?: ProductDetail | null): ProductValues {
  return {
    name: product?.name ?? "",
    product_type: product?.product_type ?? "service",
    sales_price: product?.sales_price ?? "",
    cost_price: product?.cost_price ?? "",
    tax_id: product?.tax ? String(product.tax.id) : "",
    notes: product?.notes ?? "",
    is_active: product?.is_active ?? true,
  };
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: ProductDetail | null;
  onSaved?: (product: ProductDetail) => void;
}) {
  const taxes = useTaxOptions();
  const form = useForm<ProductValues>({ resolver: zodResolver(productSchema), defaultValues: productValues(product) });
  useEffect(() => {
    if (open) form.reset(productValues(product));
  }, [open, product, form]);

  const mutation = useApiMutation<ProductValues, ProductDetail>({
    mutationFn: (v) => {
      const body = {
        name: v.name,
        product_type: v.product_type,
        sales_price: v.sales_price,
        cost_price: v.cost_price,
        tax_id: v.tax_id ? Number(v.tax_id) : null,
        notes: toNullable(v.notes),
      };
      return product
        ? api.patch<ProductDetail>(`/products/${product.id}`, { ...body, is_active: v.is_active })
        : api.post<ProductDetail>("/products", body);
    },
    invalidate: ["products"],
    success: product ? "Product updated" : "Product created",
    toastError: false,
    onSuccess: (saved) => {
      onOpenChange(false);
      onSaved?.(saved);
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={product ? "Edit product" : "New product"}
      description="Variants (for example by brand) are added on the product page after it is created."
      onSubmit={form.handleSubmit((v) =>
        mutation.mutateAsync(v).catch((e) => applyServerErrors(e, form.setError, { fields: Object.keys(v), duplicateField: "name" })),
      )}
      pending={mutation.isPending}
      submitLabel={product ? "Save changes" : "Create product"}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="name" label="Product name" required className="sm:col-span-2" />
        <SelectField
          control={form.control}
          name="product_type"
          label="Type"
          required
          options={[
            { value: "service", label: "Service (software, support…)" },
            { value: "goods", label: "Goods" },
          ]}
        />
        <SelectField
          control={form.control}
          name="tax_id"
          label="Default tax"
          allowEmpty
          emptyLabel="No tax"
          options={(taxes.data ?? []).map(taxOption)}
        />
        <MoneyField control={form.control} name="sales_price" label="Sales price" required />
        <MoneyField control={form.control} name="cost_price" label="Cost price" required />
      </div>
      <TextareaField control={form.control} name="notes" label="Notes" rows={3} />
      {product ? (
        <SwitchField
          control={form.control}
          name="is_active"
          label="Available for sale"
          description="Archived products stay on existing subscriptions but can't be added to new ones."
        />
      ) : null}
    </FormDialog>
  );
}

const variantSchema = z.object({
  attribute: z.string().trim().min(1, "Attribute is required").max(60),
  value: z.string().trim().min(1, "Value is required").max(60),
  extra_price: moneyString("Extra price"),
  is_active: z.boolean(),
});
type VariantValues = z.infer<typeof variantSchema>;

export function VariantFormDialog({
  open,
  onOpenChange,
  productId,
  variant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number;
  variant?: ProductVariant | null;
}) {
  const defaults: VariantValues = {
    attribute: variant?.attribute ?? "",
    value: variant?.value ?? "",
    extra_price: variant?.extra_price ?? "0.00",
    is_active: variant?.is_active ?? true,
  };
  const form = useForm<VariantValues>({ resolver: zodResolver(variantSchema), defaultValues: defaults });
  useEffect(() => {
    if (open) form.reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, variant]);

  const mutation = useApiMutation<VariantValues, ProductVariant>({
    mutationFn: (v) =>
      variant
        ? api.patch<ProductVariant>(`/products/${productId}/variants/${variant.id}`, v)
        : api.post<ProductVariant>(`/products/${productId}/variants`, {
            attribute: v.attribute,
            value: v.value,
            extra_price: v.extra_price,
          }),
    invalidate: ["products"],
    success: variant ? "Variant updated" : "Variant added",
    toastError: false,
    onSuccess: () => onOpenChange(false),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={variant ? "Edit variant" : "Add variant"}
      description="Choosing this variant adds its extra price to the product's sales price."
      onSubmit={form.handleSubmit((v) =>
        mutation.mutateAsync(v).catch((e) => applyServerErrors(e, form.setError, { fields: Object.keys(v), duplicateField: "value" })),
      )}
      pending={mutation.isPending}
      submitLabel={variant ? "Save variant" : "Add variant"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="attribute" label="Attribute" placeholder="Brand" required />
        <TextField control={form.control} name="value" label="Value" placeholder="Odoo" required />
      </div>
      <MoneyField control={form.control} name="extra_price" label="Extra price" required description="Example: +560 for the Odoo brand." />
      {variant ? <SwitchField control={form.control} name="is_active" label="Variant available" /> : null}
    </FormDialog>
  );
}
