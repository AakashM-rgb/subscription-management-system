import { describe, expect, it } from "vitest";

import { addDaysISO, formatDate, formatMoney, formatRate, humanize, pluralize } from "@/lib/format";

describe("formatting", () => {
  it("formats decimal-string money in INR without float drift", () => {
    expect(formatMoney("1560.00")).toBe("₹1,560.00");
    expect(formatMoney("0.1")).toBe("₹0.10");
    expect(formatMoney("1234567.89")).toBe("₹12,34,567.89");
    expect(formatMoney(null)).toBe("—");
  });

  it("prints calendar dates without time-zone shifts", () => {
    expect(formatDate("2026-10-31")).toBe("31 Oct 2026");
    expect(formatDate("2026-01-01")).toBe("01 Jan 2026");
    expect(formatDate(null)).toBe("—");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDaysISO("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("formats tax rates and labels", () => {
    expect(formatRate("18.000")).toBe("18%");
    expect(formatRate("12.500")).toBe("12.5%");
    expect(humanize("bank_transfer")).toBe("Bank transfer");
    expect(pluralize(1, "invoice")).toBe("1 invoice");
    expect(pluralize(3, "invoice")).toBe("3 invoices");
  });
});
