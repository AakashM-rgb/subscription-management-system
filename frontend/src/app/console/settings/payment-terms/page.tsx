"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HandCoins, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DataTable, type ColumnDef } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { FormDialog } from "@/components/form-dialog";
import { applyServerErrors, NumberField, SwitchField, TextField } from "@/components/form-fields";
import { PageBody, PageHeader } from "@/components/page";
import { Can, useCan } from "@/components/session";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import { useApiMutation, usePaged } from "@/lib/api/hooks";
import type { PaymentTerm } from "@/lib/api/types";
import { useListState } from "@/lib/use-list-state";
import { intString } from "@/lib/validation";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  due_days: intString("Due days", 0).refine((v) => Number(v) <= 365, "Due days cannot exceed 365"),
  is_active: z.boolean(),
});
type Values = z.infer<typeof schema>;

function TermDialog({ open, onOpenChange, term }: { open: boolean; onOpenChange: (o: boolean) => void; term: PaymentTerm | null }) {
  const values = (t: PaymentTerm | null): Values => ({ name: t?.name ?? "", due_days: t ? String(t.due_days) : "", is_active: t?.is_active ?? true });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: values(term) });
  useEffect(() => {
    if (open) form.reset(values(term));
  }, [open, term, form]);
  const mutation = useApiMutation<Values, PaymentTerm>({
    mutationFn: (v) => {
      const body = { name: v.name, due_days: Number(v.due_days) } satisfies Body<"PaymentTermCreateIn">;
      return term
        ? api.patch<PaymentTerm>(`/payment-terms/${term.id}`, { ...body, is_active: v.is_active } satisfies Body<"PaymentTermUpdateIn">)
        : api.post<PaymentTerm>("/payment-terms", body);
    },
    invalidate: ["payment-terms"],
    success: term ? "Payment term updated" : "Payment term created",
    toastError: false,
    onSuccess: () => onOpenChange(false),
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={term ? "Edit payment term" : "New payment term"}
      description="An invoice's due date is its invoice date plus the term's due days."
      onSubmit={form.handleSubmit((v) =>
        mutation.mutateAsync(v).catch((e) => applyServerErrors(e, form.setError, { fields: Object.keys(v), duplicateField: "name" })),
      )}
      pending={mutation.isPending}
      submitLabel={term ? "Save term" : "Create term"}
    >
      <TextField control={form.control} name="name" label="Name" placeholder="Net 30" required />
      <NumberField control={form.control} name="due_days" label="Due days" required description="0 means due on the invoice date." />
      {term ? <SwitchField control={form.control} name="is_active" label="Active" /> : null}
    </FormDialog>
  );
}

export default function PaymentTermsPage() {
  const list = useListState();
  const canWrite = useCan("paymentTerm.write");
  const [dialog, setDialog] = useState<{ open: boolean; term: PaymentTerm | null }>({ open: false, term: null });
  const query = usePaged<PaymentTerm>("payment-terms", "/payment-terms", { page: list.page, page_size: list.pageSize });

  const columns: ColumnDef<PaymentTerm, unknown>[] = [
    { header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    {
      header: "Due",
      meta: { align: "right" },
      cell: ({ row }) => (row.original.due_days === 0 ? "Immediately" : `${row.original.due_days} days`),
    },
    { header: "Status", cell: ({ row }) => <StatusBadge kind="active" value={row.original.is_active} /> },
  ];
  if (canWrite)
    columns.push({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { className: "w-12" },
      cell: ({ row }) => (
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${row.original.name}`} onClick={() => setDialog({ open: true, term: row.original })}>
          <Pencil />
        </Button>
      ),
    });

  return (
    <PageBody className="max-w-4xl">
      <PageHeader
        title="Payment terms"
        description="How long customers have to pay an invoice after it is issued."
        actions={
          <Can permission="paymentTerm.write">
            <Button onClick={() => setDialog({ open: true, term: null })}>
              <Plus /> New term
            </Button>
          </Can>
        }
      />
      <DataTable
        caption="Payment terms"
        columns={columns}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        empty={<EmptyState icon={HandCoins} title="No payment terms" />}
      />
      <TermDialog open={dialog.open} onOpenChange={(open) => setDialog((s) => ({ ...s, open }))} term={dialog.term} />
    </PageBody>
  );
}
