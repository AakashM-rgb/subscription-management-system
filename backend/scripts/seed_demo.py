"""Idempotent demo catalog for Brightloop: products and variants, plans, discounts, customers.

Run after `scripts.seed` (which creates the admin, taxes and payment terms):
    uv run python -m scripts.seed_demo
Re-running only adds what is missing. Development and demo data only.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Customer, Discount, Plan, Product, ProductVariant, Tax

PRODUCTS = [
    # name, type, sales price, cost price, notes, variants [(attribute, value, extra price)]
    (
        "Brightloop CRM",
        "service",
        "1000.00",
        "350.00",
        "Per seat, per billing period",
        [("Brand", "Odoo", "560.00"), ("Brand", "Standard", "0.00")],
    ),
    ("Accounting Add-on", "service", "400.00", "120.00", "Switch on or off per subscription", []),
    (
        "Cloud Backup",
        "service",
        "250.00",
        "60.00",
        "Daily encrypted backups",
        [("Storage", "100 GB", "0.00"), ("Storage", "1 TB", "450.00")],
    ),
    ("Barcode Scanner", "goods", "3200.00", "2100.00", "One-time hardware", []),
]

PLANS = [
    # name, price per seat, period, min qty, auto_close, closable, pausable, renewable
    ("Starter Monthly", "799.00", "monthly", 1, False, True, True, True),
    ("Business Monthly", "1200.00", "monthly", 5, False, True, True, True),
    ("Enterprise Yearly", "11500.00", "yearly", 25, False, False, False, True),
    ("Pilot Weekly", "199.00", "weekly", 1, True, True, False, False),
    ("Event Daily", "49.00", "daily", 1, True, True, False, False),
]

CUSTOMERS = [
    ("Kochi Traders", "accounts@kochitraders.example.com", "+919847010001", "Kochi Traders LLP"),
    ("Malabar Foods", "finance@malabarfoods.example.com", "+919847010002", "Malabar Foods Pvt Ltd"),
    ("Periyar Logistics", "ap@periyar.example.com", "+919847010003", "Periyar Logistics"),
]


def seed() -> None:
    with SessionLocal() as db:
        gst = db.scalar(select(Tax).where(Tax.name == "GST 18%"))
        if gst is None:
            raise SystemExit("Run `python -m scripts.seed` first (creates taxes and terms)")

        products: dict[str, Product] = {}
        for name, kind, price, cost, notes, variants in PRODUCTS:
            product = db.scalar(select(Product).where(Product.name == name))
            if product is None:
                product = Product(
                    name=name,
                    product_type=kind,
                    sales_price=Decimal(price),
                    cost_price=Decimal(cost),
                    notes=notes,
                    tax_id=gst.id,
                )
                product.variants = [
                    ProductVariant(attribute=a, value=v, extra_price=Decimal(x))
                    for a, v, x in variants
                ]
                db.add(product)
                print(f"product {name}")
            products[name] = product

        for name, price, period, min_qty, auto_close, closable, pausable, renewable in PLANS:
            if db.scalar(select(Plan).where(Plan.name == name)) is None:
                db.add(
                    Plan(
                        name=name,
                        price=Decimal(price),
                        billing_period=period,
                        min_quantity=min_qty,
                        available_from=date(2026, 1, 1),
                        auto_close=auto_close,
                        closable=closable,
                        pausable=pausable,
                        renewable=renewable,
                        tax_id=gst.id,
                    )
                )
                print(f"plan {name}")

        db.flush()
        if db.scalar(select(Discount).where(Discount.name == "Volume 10% (10+ seats)")) is None:
            db.add(
                Discount(
                    name="Volume 10% (10+ seats)",
                    kind="percentage",
                    value=Decimal("10"),
                    scope="subscription",
                    min_quantity=10,
                    valid_from=date(2026, 1, 1),
                    valid_until=date(2026, 12, 31),
                    usage_limit=500,
                )
            )
            print("discount Volume 10%")
        if db.scalar(select(Discount).where(Discount.name == "Backup launch ₹500 off")) is None:
            backup = Discount(
                name="Backup launch ₹500 off",
                kind="fixed",
                value=Decimal("500.00"),
                scope="product",
                min_purchase_amount=Decimal("2000.00"),
                valid_from=date(2026, 10, 1),
                valid_until=date(2027, 3, 31),
                usage_limit=100,
            )
            backup.products = [products["Cloud Backup"]]
            db.add(backup)
            print("discount Backup launch")

        for name, email, phone, company in CUSTOMERS:
            if db.scalar(select(Customer).where(Customer.email == email)) is None:
                db.add(Customer(name=name, email=email, phone=phone, company_name=company))
                print(f"customer {name}")
        db.commit()
    print("demo seed complete")


if __name__ == "__main__":
    seed()
