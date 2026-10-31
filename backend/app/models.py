"""All tables. Schema changes are made only by the migration owner (Claude 1 / Aakash)."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Computed,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    Numeric,
    Sequence,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, TimestampMixin

Money = Numeric(14, 2)
Rate = Numeric(6, 3)

ROLES = ("admin", "staff", "customer")
BILLING_PERIODS = ("daily", "weekly", "monthly", "yearly")
SUBSCRIPTION_STATUSES = ("draft", "quotation", "confirmed", "active", "closed")
INVOICE_STATUSES = ("draft", "confirmed", "paid", "cancelled")
PAYMENT_METHODS = ("cash", "bank_transfer", "card", "upi", "cheque", "other")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


subscription_number_seq = Sequence("subscription_number_seq", metadata=Base.metadata)
payment_number_seq = Sequence("payment_number_seq", metadata=Base.metadata)


# --------------------------------------------------------------------------- identity


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(_in("role", ROLES), name="role"),
        Index("ux_users_email_lower", func.lower(text("email")), unique=True),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    email: Mapped[str] = mapped_column(String(254))
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    token_version: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    customer: Mapped[Customer | None] = relationship(back_populates="user", uselist=False)


class Customer(TimestampMixin, Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), unique=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    email: Mapped[str] = mapped_column(String(254), index=True)
    phone: Mapped[str | None] = mapped_column(String(32))
    company_name: Mapped[str | None] = mapped_column(String(160))
    address: Mapped[str | None] = mapped_column(Text)
    tax_id: Mapped[str | None] = mapped_column(String(32))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))

    user: Mapped[User | None] = relationship(back_populates="customer")


# --------------------------------------------------------------------------- catalog & rules


class Tax(TimestampMixin, Base):
    __tablename__ = "taxes"
    __table_args__ = (CheckConstraint("rate >= 0 AND rate <= 100", name="rate_range"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    rate: Mapped[Decimal] = mapped_column(Rate)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))


class PaymentTerm(TimestampMixin, Base):
    __tablename__ = "payment_terms"
    __table_args__ = (CheckConstraint("due_days >= 0", name="due_days_non_negative"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    due_days: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("product_type IN ('service', 'goods')", name="product_type"),
        CheckConstraint("sales_price >= 0 AND cost_price >= 0", name="prices_non_negative"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    product_type: Mapped[str] = mapped_column(String(16))
    sales_price: Mapped[Decimal] = mapped_column(Money)
    cost_price: Mapped[Decimal] = mapped_column(Money)
    notes: Mapped[str | None] = mapped_column(Text)
    tax_id: Mapped[int | None] = mapped_column(ForeignKey("taxes.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))

    tax: Mapped[Tax | None] = relationship()
    variants: Mapped[list[ProductVariant]] = relationship(
        back_populates="product", order_by="ProductVariant.id"
    )


class ProductVariant(TimestampMixin, Base):
    __tablename__ = "product_variants"
    __table_args__ = (
        UniqueConstraint("product_id", "attribute", "value", name="uq_variant_attr_value"),
        # Target for composite FKs that guarantee a variant belongs to the line's product.
        UniqueConstraint("id", "product_id", name="uq_variant_id_product"),
        CheckConstraint("extra_price >= 0", name="extra_price_non_negative"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    attribute: Mapped[str] = mapped_column(String(60))
    value: Mapped[str] = mapped_column(String(60))
    extra_price: Mapped[Decimal] = mapped_column(Money)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))

    product: Mapped[Product] = relationship(back_populates="variants")


class Plan(TimestampMixin, Base):
    __tablename__ = "plans"
    __table_args__ = (
        CheckConstraint(_in("billing_period", BILLING_PERIODS), name="billing_period"),
        CheckConstraint("price >= 0", name="price_non_negative"),
        CheckConstraint("min_quantity >= 1", name="min_quantity_positive"),
        CheckConstraint(
            "available_until IS NULL OR available_until >= available_from", name="availability"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    price: Mapped[Decimal] = mapped_column(Money)  # per seat, per billing period
    billing_period: Mapped[str] = mapped_column(String(8))
    min_quantity: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    available_from: Mapped[date] = mapped_column(Date)
    available_until: Mapped[date | None] = mapped_column(Date)
    auto_close: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    closable: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    pausable: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    renewable: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    tax_id: Mapped[int | None] = mapped_column(ForeignKey("taxes.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))

    tax: Mapped[Tax | None] = relationship()


class Discount(TimestampMixin, Base):
    __tablename__ = "discounts"
    __table_args__ = (
        CheckConstraint("kind IN ('fixed', 'percentage')", name="kind"),
        CheckConstraint("scope IN ('subscription', 'product')", name="scope"),
        CheckConstraint("value > 0", name="value_positive"),
        CheckConstraint("kind <> 'percentage' OR value <= 100", name="percentage_max"),
        CheckConstraint(
            "min_purchase_amount IS NULL OR min_purchase_amount >= 0", name="min_purchase"
        ),
        CheckConstraint("min_quantity IS NULL OR min_quantity >= 1", name="min_quantity"),
        CheckConstraint("usage_limit IS NULL OR usage_limit > 0", name="usage_limit_positive"),
        CheckConstraint(
            "usage_count >= 0 AND (usage_limit IS NULL OR usage_count <= usage_limit)",
            name="usage_within_limit",
        ),
        CheckConstraint("valid_until IS NULL OR valid_until >= valid_from", name="validity"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(10))
    value: Mapped[Decimal] = mapped_column(Money)
    scope: Mapped[str] = mapped_column(String(12))
    min_purchase_amount: Mapped[Decimal | None] = mapped_column(Money)
    min_quantity: Mapped[int | None] = mapped_column(Integer)
    valid_from: Mapped[date] = mapped_column(Date)
    valid_until: Mapped[date | None] = mapped_column(Date)
    usage_limit: Mapped[int | None] = mapped_column(Integer)
    usage_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))

    products: Mapped[list[Product]] = relationship(secondary="discount_products")


class DiscountProduct(Base):
    __tablename__ = "discount_products"

    discount_id: Mapped[int] = mapped_column(
        ForeignKey("discounts.id", ondelete="CASCADE"), primary_key=True
    )
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), primary_key=True)


# --------------------------------------------------------------------------- subscriptions


class Subscription(TimestampMixin, Base):
    __tablename__ = "subscriptions"
    __table_args__ = (
        CheckConstraint(_in("status", SUBSCRIPTION_STATUSES), name="status"),
        CheckConstraint("term_periods > 0", name="term_positive"),
        CheckConstraint("end_date >= start_date", name="end_after_start"),
        CheckConstraint("next_period_index >= 0", name="period_index"),
        CheckConstraint("paused_at IS NULL OR status = 'active'", name="pause_only_active"),
        CheckConstraint(
            "status <> 'active' OR next_invoice_date IS NOT NULL", name="active_has_schedule"
        ),
        Index("ix_subscriptions_customer_status", "customer_id", "status"),
        Index(
            "ix_subscriptions_billing_due",
            "next_invoice_date",
            postgresql_where=text("status = 'active' AND paused_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    number: Mapped[str] = mapped_column(String(20), unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id"), index=True)
    payment_term_id: Mapped[int] = mapped_column(ForeignKey("payment_terms.id"))
    discount_id: Mapped[int | None] = mapped_column(ForeignKey("discounts.id"))
    status: Mapped[str] = mapped_column(String(12), server_default=text("'draft'"), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    term_periods: Mapped[int] = mapped_column(Integer)
    end_date: Mapped[date] = mapped_column(Date)  # inclusive expiry date
    quotation_valid_until: Mapped[date | None] = mapped_column(Date)
    next_period_index: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    next_invoice_date: Mapped[date | None] = mapped_column(Date)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    close_reason: Mapped[str | None] = mapped_column(String(200))
    amount_untaxed: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))
    amount_discount: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))
    amount_tax: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))
    amount_total: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))
    notes: Mapped[str | None] = mapped_column(Text)
    template_id: Mapped[int | None] = mapped_column(ForeignKey("quotation_templates.id"))
    auto_collect: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    mandate_id: Mapped[int | None] = mapped_column(ForeignKey("payment_mandates.id"))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    customer: Mapped[Customer] = relationship()
    plan: Mapped[Plan] = relationship()
    payment_term: Mapped[PaymentTerm] = relationship()
    discount: Mapped[Discount | None] = relationship()
    lines: Mapped[list[SubscriptionLine]] = relationship(
        back_populates="subscription",
        cascade="all, delete-orphan",
        order_by="SubscriptionLine.sequence",
    )


class SubscriptionLine(Base):
    __tablename__ = "subscription_lines"
    __table_args__ = (
        CheckConstraint("line_type IN ('plan', 'product')", name="line_type"),
        CheckConstraint("(line_type = 'plan') = (product_id IS NULL)", name="plan_line_no_product"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        ForeignKeyConstraint(
            ["variant_id", "product_id"],
            ["product_variants.id", "product_variants.product_id"],
            name="fk_subscription_lines_variant_product",
        ),
        Index(
            "ux_subscription_lines_one_plan_line",
            "subscription_id",
            unique=True,
            postgresql_where=text("line_type = 'plan'"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    subscription_id: Mapped[int] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="CASCADE"), index=True
    )
    line_type: Mapped[str] = mapped_column(String(8))
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))
    variant_id: Mapped[int | None] = mapped_column(BigInteger)
    description: Mapped[str] = mapped_column(String(255))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Money)
    tax_id: Mapped[int | None] = mapped_column(ForeignKey("taxes.id"))
    sequence: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    subtotal: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))
    discount_amount: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))
    tax_amount: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))
    total: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))

    subscription: Mapped[Subscription] = relationship(back_populates="lines")
    product: Mapped[Product | None] = relationship()
    tax: Mapped[Tax | None] = relationship()


# --------------------------------------------------------------------------- invoicing


class NumberSequence(Base):
    """Gapless counters (e.g. 'invoice:2026'), incremented under a row lock at confirmation."""

    __tablename__ = "number_sequences"

    name: Mapped[str] = mapped_column(String(40), primary_key=True)
    next_value: Mapped[int] = mapped_column(BigInteger)


class Invoice(TimestampMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (
        CheckConstraint(_in("status", INVOICE_STATUSES), name="status"),
        CheckConstraint(
            "amount_untaxed >= 0 AND amount_discount >= 0 AND amount_tax >= 0", name="amounts"
        ),
        CheckConstraint(
            "amount_total = amount_untaxed - amount_discount + amount_tax", name="total_formula"
        ),
        CheckConstraint("amount_paid >= 0 AND amount_paid <= amount_total", name="paid_range"),
        CheckConstraint("status <> 'paid' OR amount_paid = amount_total", name="paid_in_full"),
        CheckConstraint("status <> 'draft' OR amount_paid = 0", name="draft_unpaid"),
        CheckConstraint(
            "status NOT IN ('confirmed', 'paid') OR number IS NOT NULL", name="numbered"
        ),
        CheckConstraint("period_end >= period_start", name="period"),
        CheckConstraint("due_date >= invoice_date", name="due_after_invoice"),
        UniqueConstraint("id", "customer_id", name="uq_invoices_id_customer"),
        # Database-level guarantee: one live invoice per subscription billing period.
        Index(
            "ux_invoices_subscription_period",
            "subscription_id",
            "period_start",
            unique=True,
            postgresql_where=text("status <> 'cancelled'"),
        ),
        Index("ix_invoices_customer_status", "customer_id", "status"),
        Index("ix_invoices_status_due", "status", "due_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    number: Mapped[str | None] = mapped_column(String(24), unique=True)
    subscription_id: Mapped[int] = mapped_column(ForeignKey("subscriptions.id"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    status: Mapped[str] = mapped_column(String(10), server_default=text("'draft'"))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    invoice_date: Mapped[date] = mapped_column(Date, index=True)
    due_date: Mapped[date] = mapped_column(Date)
    currency: Mapped[str] = mapped_column(String(3))
    # Snapshots: later edits to customer/discount/terms never change an issued invoice.
    bill_to_name: Mapped[str] = mapped_column(String(160))
    bill_to_email: Mapped[str] = mapped_column(String(254))
    bill_to_address: Mapped[str | None] = mapped_column(Text)
    payment_term_name: Mapped[str] = mapped_column(String(60))
    discount_id: Mapped[int | None] = mapped_column(ForeignKey("discounts.id"))
    discount_name: Mapped[str | None] = mapped_column(String(120))
    amount_untaxed: Mapped[Decimal] = mapped_column(Money)
    amount_discount: Mapped[Decimal] = mapped_column(Money)
    amount_tax: Mapped[Decimal] = mapped_column(Money)
    amount_total: Mapped[Decimal] = mapped_column(Money)
    amount_paid: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))
    amount_due: Mapped[Decimal] = mapped_column(
        Money, Computed("amount_total - amount_paid", persisted=True)
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    replaces_invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"))
    billing_run_id: Mapped[int | None] = mapped_column(ForeignKey("billing_runs.id"))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    subscription: Mapped[Subscription] = relationship()
    customer: Mapped[Customer] = relationship()
    lines: Mapped[list[InvoiceLine]] = relationship(
        back_populates="invoice", order_by="InvoiceLine.sequence"
    )
    payments: Mapped[list[Payment]] = relationship(
        back_populates="invoice", order_by="Payment.id", overlaps="customer"
    )


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    __table_args__ = (
        CheckConstraint("taxable_amount = subtotal - discount_amount", name="taxable_formula"),
        CheckConstraint("total = taxable_amount + tax_amount", name="total_formula"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    line_type: Mapped[str] = mapped_column(String(8))
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))
    description: Mapped[str] = mapped_column(String(255))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Money)
    subtotal: Mapped[Decimal] = mapped_column(Money)
    discount_amount: Mapped[Decimal] = mapped_column(Money)
    taxable_amount: Mapped[Decimal] = mapped_column(Money)
    tax_name: Mapped[str | None] = mapped_column(String(60))
    tax_rate: Mapped[Decimal] = mapped_column(Rate, server_default=text("0"))
    tax_amount: Mapped[Decimal] = mapped_column(Money)
    total: Mapped[Decimal] = mapped_column(Money)
    sequence: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    invoice: Mapped[Invoice] = relationship(back_populates="lines")


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(_in("method", PAYMENT_METHODS), name="method"),
        CheckConstraint("status IN ('posted', 'voided')", name="status"),
        CheckConstraint("amount > 0", name="amount_positive"),
        # A payment can only ever point at an invoice of the same customer.
        ForeignKeyConstraint(
            ["invoice_id", "customer_id"],
            ["invoices.id", "invoices.customer_id"],
            name="fk_payments_invoice_customer",
        ),
        Index("ix_payments_customer_date", "customer_id", "payment_date"),
        UniqueConstraint("provider", "provider_payment_id", name="uq_payments_provider_ref"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    number: Mapped[str] = mapped_column(String(20), unique=True)
    invoice_id: Mapped[int] = mapped_column(BigInteger, index=True)
    customer_id: Mapped[int] = mapped_column(BigInteger)
    method: Mapped[str] = mapped_column(String(16))
    amount: Mapped[Decimal] = mapped_column(Money)
    payment_date: Mapped[date] = mapped_column(Date, index=True)
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(8), server_default=text("'posted'"))
    idempotency_key: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), unique=True)
    recorded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    provider: Mapped[str | None] = mapped_column(String(24))
    provider_payment_id: Mapped[str | None] = mapped_column(String(64))
    payment_attempt_id: Mapped[int | None] = mapped_column(ForeignKey("payment_attempts.id"))
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    void_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    invoice: Mapped[Invoice] = relationship(back_populates="payments", overlaps="payments")


# --------------------------------------------------------------------------- auth support


class AuthToken(Base):
    """Single-use password-reset / invitation tokens. Only a SHA-256 hash is stored."""

    __tablename__ = "auth_tokens"
    __table_args__ = (CheckConstraint("purpose IN ('reset', 'invite')", name="purpose"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[str] = mapped_column(String(8))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LoginAttempt(Base):
    """Sign-in attempts, used for brute-force throttling across worker processes."""

    __tablename__ = "login_attempts"
    __table_args__ = (Index("ix_login_attempts_email_time", "email", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    email: Mapped[str] = mapped_column(String(254))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    succeeded: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EmailOutbox(Base):
    """Transactional outbox: rows are written in the same transaction as the business change."""

    __tablename__ = "email_outbox"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'sending', 'sent', 'dead')", name="status"),
        Index(
            "ix_email_outbox_pending",
            "next_attempt_at",
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    idempotency_key: Mapped[str] = mapped_column(String(120), unique=True)
    to_email: Mapped[str] = mapped_column(String(254))
    subject: Mapped[str] = mapped_column(String(200))
    template: Mapped[str] = mapped_column(String(60))
    context: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    status: Mapped[str] = mapped_column(String(8), server_default=text("'pending'"))
    attempts: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# --------------------------------------------------------------------------- quotations


class QuotationTemplate(TimestampMixin, Base):
    __tablename__ = "quotation_templates"
    __table_args__ = (
        CheckConstraint("validity_days > 0", name="validity_positive"),
        CheckConstraint("plan_quantity >= 1", name="plan_quantity_positive"),
        CheckConstraint("term_periods IS NULL OR term_periods > 0", name="term_positive"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id"))
    plan_quantity: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    payment_term_id: Mapped[int | None] = mapped_column(ForeignKey("payment_terms.id"))
    term_periods: Mapped[int | None] = mapped_column(Integer)
    validity_days: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))

    plan: Mapped[Plan] = relationship()
    lines: Mapped[list[QuotationTemplateLine]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="QuotationTemplateLine.sequence",
    )


class QuotationTemplateLine(Base):
    __tablename__ = "quotation_template_lines"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price IS NULL OR unit_price >= 0", name="unit_price"),
        ForeignKeyConstraint(
            ["variant_id", "product_id"],
            ["product_variants.id", "product_variants.product_id"],
            name="fk_quotation_template_lines_variant_product",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    template_id: Mapped[int] = mapped_column(
        ForeignKey("quotation_templates.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    variant_id: Mapped[int | None] = mapped_column(BigInteger)
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal | None] = mapped_column(Money)
    sequence: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    template: Mapped[QuotationTemplate] = relationship(back_populates="lines")


# --------------------------------------------------------------------------- billing engine


class BillingRun(Base):
    """Execution history of every billing cycle (scheduled, manual or single-subscription)."""

    __tablename__ = "billing_runs"
    __table_args__ = (
        CheckConstraint("trigger IN ('scheduled', 'manual', 'subscription')", name="trigger"),
        CheckConstraint("status IN ('running', 'succeeded', 'partial', 'failed')", name="status"),
        Index("ix_billing_runs_started", "started_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    trigger: Mapped[str] = mapped_column(String(12))
    as_of: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), server_default=text("'running'"))
    triggered_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    subscriptions_due: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    invoices_created: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    failures: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    items: Mapped[list[BillingRunItem]] = relationship(
        back_populates="run", order_by="BillingRunItem.id"
    )


class BillingRunItem(Base):
    """Per-subscription outcome of a billing run; failed subscriptions stay due and are retried."""

    __tablename__ = "billing_run_items"
    __table_args__ = (CheckConstraint("status IN ('billed', 'failed')", name="status"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    billing_run_id: Mapped[int] = mapped_column(
        ForeignKey("billing_runs.id", ondelete="CASCADE"), index=True
    )
    subscription_id: Mapped[int] = mapped_column(ForeignKey("subscriptions.id"), index=True)
    status: Mapped[str] = mapped_column(String(8))
    invoices_created: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    run: Mapped[BillingRun] = relationship(back_populates="items")


# --------------------------------------------------------------------------- audit


class AuditEvent(Base):
    """Append-only history of business and financial operations (a DB trigger blocks edits)."""

    __tablename__ = "audit_events"
    __table_args__ = (
        CheckConstraint("actor_type IN ('user', 'system', 'provider')", name="actor_type"),
        Index("ix_audit_events_entity", "entity_type", "entity_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    actor_type: Mapped[str] = mapped_column(String(8))
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(48))
    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[int] = mapped_column(BigInteger)
    data: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --------------------------------------------------------------------------- payment collection


class PaymentMandate(TimestampMixin, Base):
    """A customer-authorised recurring payment instruction held by a payment provider.

    Only provider references and a display hint (e.g. "Visa **** 4242") are stored.
    Raw card or bank credentials never touch this system.
    """

    __tablename__ = "payment_mandates"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'active', 'paused', 'cancelled', 'failed')", name="status"
        ),
        CheckConstraint("max_amount IS NULL OR max_amount > 0", name="max_amount"),
        UniqueConstraint("provider", "provider_mandate_id", name="uq_mandates_provider_ref"),
        Index("ix_payment_mandates_customer_status", "customer_id", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    provider: Mapped[str] = mapped_column(String(24))
    provider_customer_id: Mapped[str | None] = mapped_column(String(64))
    provider_mandate_id: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(10), server_default=text("'pending'"))
    method_type: Mapped[str | None] = mapped_column(String(16))
    display_hint: Mapped[str | None] = mapped_column(String(64))
    max_amount: Mapped[Decimal | None] = mapped_column(Money)
    authorized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PaymentAttempt(TimestampMixin, Base):
    """One request to a provider to collect an invoice. Money counts only once a Payment exists."""

    __tablename__ = "payment_attempts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('created', 'processing', 'succeeded', 'failed', 'cancelled')",
            name="status",
        ),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("attempt_number >= 1", name="attempt_number"),
        UniqueConstraint("provider", "provider_reference", name="uq_attempts_provider_ref"),
        Index(
            "ux_payment_attempts_inflight",
            "invoice_id",
            unique=True,
            postgresql_where=text("status IN ('created', 'processing')"),
        ),
        Index(
            "ix_payment_attempts_retry",
            "next_retry_at",
            postgresql_where=text("status = 'failed' AND next_retry_at IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    mandate_id: Mapped[int] = mapped_column(ForeignKey("payment_mandates.id"))
    provider: Mapped[str] = mapped_column(String(24))
    provider_reference: Mapped[str | None] = mapped_column(String(64))
    idempotency_key: Mapped[str] = mapped_column(String(80), unique=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    status: Mapped[str] = mapped_column(String(10), server_default=text("'created'"))
    attempt_number: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    failure_code: Mapped[str | None] = mapped_column(String(64))
    failure_message: Mapped[str | None] = mapped_column(Text)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProviderEvent(Base):
    """Webhook inbox: each verified provider event is stored once, then processed idempotently."""

    __tablename__ = "provider_events"
    __table_args__ = (
        CheckConstraint("status IN ('received', 'processed', 'failed', 'ignored')", name="status"),
        UniqueConstraint("provider", "event_id", name="uq_provider_events_event"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    provider: Mapped[str] = mapped_column(String(24))
    event_id: Mapped[str] = mapped_column(String(100))
    event_type: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(10), server_default=text("'received'"))
    processing_error: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
