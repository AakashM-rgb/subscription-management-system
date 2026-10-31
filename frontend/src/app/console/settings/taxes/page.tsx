"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Percent, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DataTable, type ColumnDef } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { FormDialog } from "@/components/form-dialog";
import { applyServerErrors, SwitchField, TextField } from "@/components/form-fields";
import { PageBody, PageHeader } from "@/components/page";
import { Can, useCan } from "@/components/session";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { useApiMutation, usePaged } from "@/lib/api/hooks";
import type { Tax } from "@/lib/api/types";
import { formatRate } from "@/lib/format";
import { useListState } from "@/lib/use-list-state";
import { rateString } from "@/lib/validation";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  rate: rateString,
  is_active: z.boolean(),
});
type Values = z.infer<typeof schema>;

function TaxDialog({ open, onOpenChange, tax }: { open: boolean; onOpenChange: (o: boolean) => void; tax: Tax | null }) {
  const values = (t: Tax | null): Values => ({ name: t?.name ?? "", rate: t ? String(Number(t.rate)) : "", is_active: t?.is_active ?? true });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: values(tax) });
  useEffect(() => {
    if (open) form.reset(values(tax));
  }, [open, tax, form]);
  const mutation = useApiMutation<Values, Tax>({
    mutationFn: (v) =>
      tax ? api.patch<Tax>(`/taxes/${tax.id}`, v) : api.post<Tax>("/taxes", { name: v.name, rate: v.rate }),
    invalidate: ["taxes"],
    success: tax ? "Tax updated" : "Tax created",
    toastError: false,
    onSuccess: () => onOpenChange(false),
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tax ? "Edit tax" : "New tax"}
      description="Taxes are applied automatically to invoice lines for the products and plans that use them."
      onSubmit={form.handleSubmit((v) =>
        mutation.mutateAsync(v).catch((e) => applyServerErrors(e, form.setError, { fields: Object.keys(v), duplicateField: "name" })),
      )}
      pending={mutation.isPending}
      submitLabel={tax ? "Save tax" : "Create tax"}
    >
      <TextField control={form.control} name="name" label="Name" placeholder="GST 18%" required />
      <TextField control={form.control} name="rate" label="Rate (%)" inputMode="decimal" placeholder="18" required />
      {tax ? <SwitchField control={form.control} name="is_active" label="Active" description="Inactive taxes can't be chosen for products or plans." /> : null}
    </FormDialog>
  );
}

export default function TaxesPage() {
  const list = useListState();
  const canWrite = useCan("tax.write");
  const [dialog, setDialog] = useState<{ open: boolean; tax: Tax | null }>({ open: false, tax: null });
  const query = usePaged<Tax>("taxes", "/taxes", { page: list.page, page_size: list.pageSize });

  const columns: ColumnDef<Tax, unknown>[] = [
    { header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { header: "Rate", meta: { align: "right" }, cell: ({ row }) => formatRate(row.original.rate) },
    { header: "Status", cell: ({ row }) => <StatusBadge kind="active" value={row.original.is_active} /> },
  ];
  if (canWrite)
    columns.push({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { className: "w-12" },
      cell: ({ row }) => (
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${row.original.name}`} onClick={() => setDialog({ open: true, tax: row.original })}>
          <Pencil />
        </Button>
      ),
    });

  return (
    <PageBody className="max-w-4xl">
      <PageHeader
        title="Taxes"
        description="Tax rules the admin sets. Invoices calculate tax from these automatically."
        actions={
          <Can permission="tax.write">
            <Button onClick={() => setDialog({ open: true, tax: null })}>
              <Plus /> New tax
            </Button>
          </Can>
        }
      />
      <DataTable
        caption="Taxes"
        columns={columns}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        empty={<EmptyState icon={Percent} title="No taxes configured" />}
      />
      <TaxDialog open={dialog.open} onOpenChange={(open) => setDialog((s) => ({ ...s, open }))} tax={dialog.tax} />
    </PageBody>
  );
}
