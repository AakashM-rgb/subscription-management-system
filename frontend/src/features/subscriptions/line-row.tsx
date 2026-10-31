"use client";

import { Trash2 } from "lucide-react";
import { Controller, useWatch, type Control } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useResource } from "@/lib/api/hooks";
import type { ProductDetail } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";

export interface LineValue {
  product_id: string;
  variant_id: string;
  quantity: string;
  unit_price: string;
}

/** Any form with a `lines` field array of product lines. */
export interface LinesForm {
  lines: LineValue[];
}

/** One product line: product, variant (with its extra price), quantity and optional unit price override. */
export function ProductLineRow({
  index,
  control,
  products,
  onRemove,
  onProductChange,
}: {
  index: number;
  control: Control<LinesForm>;
  products: { value: string; label: string }[];
  onRemove: () => void;
  onProductChange: () => void;
}) {
  const productId = useWatch({ control, name: `lines.${index}.product_id` });
  const detail = useResource<ProductDetail>(["products", "detail", productId || "none"], productId ? `/products/${productId}` : null);
  const variants = (detail.data?.variants ?? []).filter((v) => v.is_active);

  return (
    <li className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-12 sm:items-start">
      <div className="sm:col-span-4">
        <Controller
          control={control}
          name={`lines.${index}.product_id`}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor={`line-${index}-product`} className="text-xs">
                Product
              </FieldLabel>
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  onProductChange();
                }}
              >
                <SelectTrigger id={`line-${index}-product`} className="h-9 w-full bg-background" aria-invalid={fieldState.invalid || undefined}>
                  <SelectValue placeholder="Choose a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </div>
      <div className="sm:col-span-3">
        <Controller
          control={control}
          name={`lines.${index}.variant_id`}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={`line-${index}-variant`} className="text-xs">
                Variant
              </FieldLabel>
              <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)} disabled={!variants.length}>
                <SelectTrigger id={`line-${index}-variant`} className="h-9 w-full bg-background">
                  <SelectValue placeholder={detail.isFetching ? "Loading…" : "None"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No variant</SelectItem>
                  {variants.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.attribute}: {v.value} (+{formatMoney(v.extra_price)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
      </div>
      <div className="sm:col-span-2">
        <Controller
          control={control}
          name={`lines.${index}.quantity`}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor={`line-${index}-qty`} className="text-xs">
                Quantity
              </FieldLabel>
              <Input {...field} id={`line-${index}-qty`} inputMode="numeric" className="tabular h-9 bg-background" aria-invalid={fieldState.invalid || undefined} />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </div>
      <div className="sm:col-span-2">
        <Controller
          control={control}
          name={`lines.${index}.unit_price`}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor={`line-${index}-price`} className="text-xs">
                Unit price
              </FieldLabel>
              <Input {...field} id={`line-${index}-price`} inputMode="decimal" placeholder="Default" className="tabular h-9 bg-background" aria-invalid={fieldState.invalid || undefined} />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </div>
      <div className="flex justify-end sm:col-span-1 sm:pt-6">
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove line ${index + 1}`}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
