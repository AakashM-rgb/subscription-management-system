"use client";

import { Pencil, Plus, Tags } from "lucide-react";
import { use, useState } from "react";

import { EmptyState, ErrorState, PageSkeleton } from "@/components/feedback";
import { DetailList, PageBody, PageHeader, Section } from "@/components/page";
import { Can, useCan } from "@/components/session";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductFormDialog, VariantFormDialog } from "@/features/catalog/product-form";
import { useResource } from "@/lib/api/hooks";
import type { ProductDetail, ProductVariant } from "@/lib/api/types";
import { formatDate, formatMoney, formatRate, humanize } from "@/lib/format";

/** Display-only sum of two server decimals, rounded to cents (never sent back to the API). */
function displaySum(a: string, b: string): string {
  return (Math.round(Number(a) * 100 + Number(b) * 100) / 100).toFixed(2);
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const product = useResource<ProductDetail>(["products", "detail", id], `/products/${id}`);
  const canWrite = useCan("catalog.write");
  const [editing, setEditing] = useState(false);
  const [variantDialog, setVariantDialog] = useState<{ open: boolean; variant: ProductVariant | null }>({
    open: false,
    variant: null,
  });

  if (product.isPending) return <PageSkeleton />;
  if (product.error) return <ErrorState error={product.error} onRetry={() => product.refetch()} />;
  const p = product.data;

  return (
    <PageBody>
      <PageHeader
        back={{ href: "/console/products", label: "Products" }}
        title={p.name}
        badges={<StatusBadge kind="active" value={p.is_active} />}
        description={`${humanize(p.product_type)} · Created ${formatDate(p.created_at)}`}
        actions={
          <Can permission="catalog.write">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Edit product
            </Button>
          </Can>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Pricing" className="lg:col-span-1">
          <DetailList
            columns={1}
            items={[
              { label: "Sales price", value: <span className="tabular text-base font-semibold">{formatMoney(p.sales_price)}</span> },
              { label: "Cost price", value: <span className="tabular">{formatMoney(p.cost_price)}</span> },
              { label: "Default tax", value: p.tax ? `${p.tax.name} (${formatRate(p.tax.rate)})` : "No tax" },
              { label: "Notes", value: <span className="whitespace-pre-line">{p.notes || "—"}</span> },
            ]}
          />
        </Section>
        <Section
          className="lg:col-span-2"
          title="Variants"
          description="Each variant adds its extra price to the base sales price."
          contentClassName="p-0"
          actions={
            canWrite ? (
              <Button size="sm" onClick={() => setVariantDialog({ open: true, variant: null })}>
                <Plus /> Add variant
              </Button>
            ) : null
          }
        >
          {p.variants.length === 0 ? (
            <EmptyState
              compact
              icon={Tags}
              title="No variants"
              description="Offer this product in variants, for example by brand, each with its own extra price."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="px-5">Attribute</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className="text-right">Extra price</TableHead>
                    <TableHead className="text-right">Effective price</TableHead>
                    <TableHead>Status</TableHead>
                    {canWrite ? <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.variants.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="px-5">{v.attribute}</TableCell>
                      <TableCell className="font-medium">{v.value}</TableCell>
                      <TableCell className="tabular text-right">+{formatMoney(v.extra_price)}</TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {formatMoney(displaySum(p.sales_price, v.extra_price))}
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="active" value={v.is_active} />
                      </TableCell>
                      {canWrite ? (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit variant ${v.attribute} ${v.value}`}
                            onClick={() => setVariantDialog({ open: true, variant: v })}
                          >
                            <Pencil />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>
      </div>
      <ProductFormDialog open={editing} onOpenChange={setEditing} product={p} />
      <VariantFormDialog
        open={variantDialog.open}
        onOpenChange={(open) => setVariantDialog((s) => ({ ...s, open }))}
        productId={p.id}
        variant={variantDialog.variant}
      />
    </PageBody>
  );
}
