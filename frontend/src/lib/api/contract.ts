/**
 * Compile-time contract check: every domain type in ./types.ts must have exactly the fields of the
 * backend schema it models. `npm run api:types` regenerates openapi.gen.ts from the live backend;
 * if the backend adds, renames or removes a field, `tsc` (and therefore `next build`) fails here.
 */
import type { components } from "@/lib/api/openapi.gen";
import type * as T from "@/lib/api/types";

type Schemas = components["schemas"];
type SameKeys<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never] ? true : { onlyInFrontend: Exclude<keyof A, keyof B>; onlyInBackend: Exclude<keyof B, keyof A> };
type Assert<T extends true> = T;

export type ContractChecks = [
  Assert<SameKeys<T.Me, Schemas["MeOut"]>>,
  Assert<SameKeys<T.User, Schemas["UserOut"]>>,
  Assert<SameKeys<T.Customer, Schemas["CustomerOut"]>>,
  Assert<SameKeys<T.CustomerBalance, Schemas["CustomerBalanceOut"]>>,
  Assert<SameKeys<T.Tax, Schemas["TaxOut"]>>,
  Assert<SameKeys<T.PaymentTerm, Schemas["PaymentTermOut"]>>,
  Assert<SameKeys<T.Product, Schemas["ProductOut"]>>,
  Assert<SameKeys<T.ProductDetail, Schemas["ProductDetailOut"]>>,
  Assert<SameKeys<T.ProductVariant, Schemas["VariantOut"]>>,
  Assert<SameKeys<T.Plan, Schemas["PlanOut"]>>,
  Assert<SameKeys<T.Discount, Schemas["DiscountOut"]>>,
  Assert<SameKeys<T.QuotationTemplate, Schemas["TemplateOut"]>>,
  Assert<SameKeys<T.SubscriptionListItem, Schemas["SubscriptionListItem"]>>,
  Assert<SameKeys<T.Subscription, Schemas["SubscriptionOut"]>>,
  Assert<SameKeys<T.SubscriptionLine, Schemas["SubscriptionLineOut"]>>,
  Assert<SameKeys<T.AuditEvent, Schemas["EventOut"]>>,
  Assert<SameKeys<T.PricingPreview, Schemas["PricingPreviewOut"]>>,
  Assert<SameKeys<T.InvoiceListItem, Schemas["InvoiceListItem"]>>,
  Assert<SameKeys<T.Invoice, Schemas["InvoiceOut"]>>,
  Assert<SameKeys<T.InvoiceLine, Schemas["InvoiceLineOut"]>>,
  Assert<SameKeys<T.InvoicePayment, Schemas["InvoicePaymentOut"]>>,
  Assert<SameKeys<T.BulkConfirmResult, Schemas["BulkConfirmOut"]>>,
  Assert<SameKeys<T.Payment, Schemas["PaymentOut"]>>,
  Assert<SameKeys<T.PortalPayment, Schemas["PortalPaymentOut"]>>,
  Assert<SameKeys<T.PaymentAttempt, Schemas["PaymentAttemptOut"]>>,
  Assert<SameKeys<T.Mandate, Schemas["MandateOut"]>>,
  Assert<SameKeys<T.BillingRun, Schemas["BillingRunOut"]>>,
  Assert<SameKeys<T.BillingRunDetail, Schemas["BillingRunDetailOut"]>>,
  Assert<SameKeys<T.BillingRunItem, Schemas["BillingRunItemOut"]>>,
  Assert<SameKeys<T.ReportSummary, Schemas["SummaryReportOut"]>>,
  Assert<SameKeys<T.RevenuePoint, Schemas["RevenuePointOut"]>>,
  Assert<SameKeys<T.MethodBreakdown, Schemas["MethodBreakdownOut"]>>,
  Assert<SameKeys<T.StatusCount, Schemas["StatusCountOut"]>>,
  Assert<SameKeys<T.OverdueInvoiceRow, Schemas["OverdueInvoiceOut"]>>,
  Assert<SameKeys<T.UnappliedPayment, Schemas["UnappliedPaymentOut"]>>,
  Assert<SameKeys<T.PortalSummary, Schemas["PortalSummaryOut"]>>,
  Assert<SameKeys<T.PortalProfile, Schemas["ProfileOut"]>>,
];
