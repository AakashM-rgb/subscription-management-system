import { BrandMark } from "@/components/brand";
import { OverdueBadge, StatusBadge } from "@/components/status-badge";
import { PAYMENT_METHOD_LABEL } from "@/features/columns";
import type { Invoice } from "@/lib/api/types";
import { formatDate, formatMoney, formatRate, humanize } from "@/lib/format";

const COMPANY = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Brightloop Software";

/** The invoice as a document. Used on screen and as the print layout (A4, no app chrome). */
export function InvoiceDocument({ invoice: inv }: { invoice: Invoice }) {
  const money = (v: string) => formatMoney(v, inv.currency);
  const postedPayments = inv.payments.filter((p) => p.status === "posted");
  return (
    <article
      data-print="document"
      className="mx-auto max-w-4xl rounded-xl border bg-white p-6 text-slate-900 shadow-xs sm:p-10 print:text-[11pt]"
      aria-label={`Invoice ${inv.number ?? "draft"}`}
    >
      <header className="flex flex-col gap-6 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10" />
          <div>
            <p className="text-lg font-semibold">{COMPANY}</p>
            <p className="text-sm text-slate-500">Subscription billing</p>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
            {inv.status === "draft" ? "Draft invoice" : inv.status === "cancelled" ? "Cancelled invoice" : "Tax invoice"}
          </p>
          <p className="tabular text-2xl font-semibold">{inv.number ?? `Draft #${inv.id}`}</p>
          <div className="mt-2 flex flex-wrap gap-1 sm:justify-end print:hidden">
            <StatusBadge kind="invoice" value={inv.status} />
            {inv.status !== "draft" && inv.status !== "cancelled" ? <StatusBadge kind="payment_state" value={inv.payment_state} /> : null}
            {inv.is_overdue ? <OverdueBadge days={inv.days_overdue} /> : null}
          </div>
        </div>
      </header>

      <section className="grid gap-6 border-b py-6 sm:grid-cols-3">
        <div>
          <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Bill to</h2>
          <p className="mt-1 font-medium">{inv.bill_to_name}</p>
          <p className="text-sm text-slate-600">{inv.bill_to_email}</p>
          {inv.bill_to_address ? <p className="mt-1 text-sm whitespace-pre-line text-slate-600">{inv.bill_to_address}</p> : null}
        </div>
        <dl className="space-y-1 text-sm sm:col-span-2 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:space-y-0">
          {[
            ["Invoice date", formatDate(inv.invoice_date)],
            ["Due date", formatDate(inv.due_date)],
            ["Billing period", `${formatDate(inv.period_start)} – ${formatDate(inv.period_end)}`],
            ["Payment terms", inv.payment_term_name],
            ["Subscription", inv.subscription.number],
            ["Currency", inv.currency],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-1 sm:block">
              <dt className="text-slate-500">{label}</dt>
              <dd className="tabular font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="py-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Invoice lines</caption>
            <thead>
              <tr className="border-b text-left text-xs tracking-wide text-slate-500 uppercase">
                <th scope="col" className="py-2 pr-3 font-medium">Description</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Qty</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Unit price</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Discount</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Tax</th>
                <th scope="col" className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((line) => (
                <tr key={line.id} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-3">{line.description}</td>
                  <td className="tabular py-3 pr-3 text-right">{line.quantity}</td>
                  <td className="tabular py-3 pr-3 text-right">{money(line.unit_price)}</td>
                  <td className="tabular py-3 pr-3 text-right">
                    {Number(line.discount_amount) > 0 ? `−${money(line.discount_amount)}` : "—"}
                  </td>
                  <td className="tabular py-3 pr-3 text-right">
                    {line.tax_name ? (
                      <>
                        {money(line.tax_amount)}
                        <span className="block text-xs text-slate-500">
                          {line.tax_name} {formatRate(line.tax_rate)}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="tabular py-3 text-right font-medium">{money(line.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Untaxed amount</dt>
              <dd className="tabular">{money(inv.amount_untaxed)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Discount{inv.discount_name ? ` (${inv.discount_name})` : ""}</dt>
              <dd className="tabular">{Number(inv.amount_discount) > 0 ? `−${money(inv.amount_discount)}` : money("0")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Tax</dt>
              <dd className="tabular">{money(inv.amount_tax)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular">{money(inv.amount_total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Paid</dt>
              <dd className="tabular">{money(inv.amount_paid)}</dd>
            </div>
            <div className="flex justify-between rounded-md bg-slate-50 px-2 py-1.5 font-semibold">
              <dt>Amount due</dt>
              <dd className={`tabular ${inv.is_overdue ? "text-red-700" : ""}`}>{money(inv.amount_due)}</dd>
            </div>
          </dl>
        </div>
      </section>

      {postedPayments.length ? (
        <section className="border-t pt-6">
          <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Payments received</h2>
          <ul className="mt-2 divide-y text-sm">
            {postedPayments.map((p) => (
              <li key={p.id} className="flex justify-between gap-4 py-2">
                <span>
                  <span className="tabular font-medium">{p.number}</span> · {formatDate(p.payment_date)} ·{" "}
                  {PAYMENT_METHOD_LABEL[p.method] ?? humanize(p.method)}
                </span>
                <span className="tabular">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inv.status === "cancelled" && inv.cancel_reason ? (
        <p className="mt-6 rounded-md bg-rose-50 p-3 text-sm text-rose-800">Cancelled: {inv.cancel_reason}</p>
      ) : null}
      <footer className="mt-8 border-t pt-4 text-xs text-slate-500">
        Thank you for your business. Please quote {inv.number ?? "the invoice number"} with your payment.
      </footer>
    </article>
  );
}
