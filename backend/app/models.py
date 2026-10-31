"""All MVP tables. Schema changes are made only by the migration owner (Aakash)."""

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
    close_reason: Mapped[str | None] = mapped_column(String(24))
    amount_untaxed: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))
    amount_discount: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))
    amount_tax: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))
    amount_total: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))
    notes: Mapped[str | None] = mapped_column(Text)
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
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    void_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    invoice: Mapped[Invoice] = relationship(back_populates="payments", overlaps="payments")
