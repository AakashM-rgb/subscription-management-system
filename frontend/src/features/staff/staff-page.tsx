"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { PasswordChecklist } from "@/components/auth/password-checklist";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, FilterSelect, TableToolbar, type ColumnDef } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { FormDialog } from "@/components/form-dialog";
import { applyServerErrors, TextField } from "@/components/form-fields";
import { PageBody, PageHeader } from "@/components/page";
import { useSession } from "@/components/session";
import { Pill, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import { useApiMutation, usePaged } from "@/lib/api/hooks";
import type { User } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
import { useListState } from "@/lib/use-list-state";
import { emailSchema, passwordSchema } from "@/lib/validation";

const schema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(120),
  email: emailSchema,
  password: passwordSchema,
});
type Values = z.infer<typeof schema>;

function AddStaffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { full_name: "", email: "", password: "" }, mode: "onTouched" });
  const password = useWatch({ control: form.control, name: "password" });
  const mutation = useApiMutation<Values, User>({
    mutationFn: (v) => api.post<User>("/users/staff", { ...v } satisfies Body<"StaffCreateIn">),
    invalidate: ["users"],
    success: (u) => `${u.full_name} can now sign in as staff`,
    toastError: false,
    onSuccess: () => {
      form.reset();
      onOpenChange(false);
    },
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add staff member"
      description="Staff handle customers, quotations, subscriptions, invoices and payments. Only admins can change catalog, taxes, discounts and staff."
      onSubmit={form.handleSubmit((v) =>
        mutation.mutateAsync(v).catch((e) => applyServerErrors(e, form.setError, { fields: Object.keys(v), duplicateField: "email" })),
      )}
      pending={mutation.isPending}
      submitLabel="Add staff member"
    >
      <TextField control={form.control} name="full_name" label="Full name" required autoComplete="off" />
      <TextField control={form.control} name="email" label="Work email" type="email" required autoComplete="off" />
      <div className="space-y-2">
        <TextField
          control={form.control}
          name="password"
          label="Temporary password"
          type="password"
          required
          autoComplete="new-password"
          description="Share it securely; they can change it from their account page."
        />
        <PasswordChecklist value={password ?? ""} />
      </div>
    </FormDialog>
  );
}

export function StaffPage() {
  const me = useSession();
  const list = useListState(["role"] as const);
  const [adding, setAdding] = useState(false);
  const [toggle, setToggle] = useState<User | null>(null);
  const query = usePaged<User>("users", "/users", { page: list.page, page_size: list.pageSize, role: list.filters.role || undefined });

  const setActive = useApiMutation<{ user: User; active: boolean }, User>({
    mutationFn: ({ user, active }) => api.patch<User>(`/users/${user.id}`, { is_active: active } satisfies Body<"UserUpdateIn">),
    invalidate: ["users"],
    success: (u) => (u.is_active ? `${u.full_name} reactivated` : `${u.full_name} deactivated and signed out`),
  });

  const columns: ColumnDef<User, unknown>[] = [
    {
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">
            {row.original.full_name}
            {row.original.id === me.id ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      header: "Role",
      cell: ({ row }) => (
        <Pill tone={row.original.role === "admin" ? "primary" : row.original.role === "staff" ? "info" : "neutral"} label={ROLE_LABEL[row.original.role]} />
      ),
    },
    { header: "Added", cell: ({ row }) => formatDate(row.original.created_at) },
    { header: "Status", cell: ({ row }) => <StatusBadge kind="active" value={row.original.is_active} /> },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: "right" },
      cell: ({ row }) =>
        row.original.id === me.id || row.original.role === "customer" ? null : (
          <Button variant="outline" size="sm" onClick={() => setToggle(row.original)}>
            {row.original.is_active ? "Deactivate" : "Reactivate"}
          </Button>
        ),
    },
  ];

  return (
    <PageBody>
      <PageHeader
        title="Staff & users"
        description="Only admins can add staff. Deactivating a user signs them out everywhere."
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus /> Add staff member
          </Button>
        }
      />
      <TableToolbar>
        <FilterSelect
          label="Role"
          value={list.filters.role}
          onChange={(v) => list.setFilter("role", v)}
          options={[
            { value: "admin", label: "Admin" },
            { value: "staff", label: "Staff" },
            { value: "customer", label: "Customer" },
          ]}
        />
      </TableToolbar>
      <DataTable
        caption="Users"
        columns={columns}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={<EmptyState icon={ShieldCheck} title="No users" />}
      />
      <AddStaffDialog open={adding} onOpenChange={setAdding} />
      <ConfirmDialog
        open={toggle !== null}
        onOpenChange={(open) => (!open ? setToggle(null) : undefined)}
        title={toggle?.is_active ? `Deactivate ${toggle?.full_name}?` : `Reactivate ${toggle?.full_name}?`}
        description={
          toggle?.is_active
            ? "They will be signed out immediately and won't be able to sign in until reactivated."
            : "They will be able to sign in again with their existing password."
        }
        confirmLabel={toggle?.is_active ? "Deactivate" : "Reactivate"}
        destructive={toggle?.is_active}
        onConfirm={() => (toggle ? setActive.mutateAsync({ user: toggle, active: !toggle.is_active }) : undefined)}
      />
    </PageBody>
  );
}
