import { describe, expect, it } from "vitest";

import { moneyString, passwordSchema, PASSWORD_RULES, rateString } from "@/lib/validation";

describe("password policy (more than 8 chars, upper, lower, special)", () => {
  it.each([
    ["Abcdefg!1", true], // 9 characters, all classes
    ["Abcdefg!", false], // exactly 8 is not "more than eight"
    ["abcdefgh!", false], // no uppercase
    ["ABCDEFGH!", false], // no lowercase
    ["Abcdefghi", false], // no special character
    ["Seats@Yearly2026", true],
  ])("%s → %s", (password, valid) => {
    expect(passwordSchema.safeParse(password).success).toBe(valid);
  });

  it("explains exactly which rules failed", () => {
    const result = passwordSchema.safeParse("abc");
    expect(result.success).toBe(false);
    const message = result.error!.issues[0].message;
    expect(message).toContain("more than 8 characters");
    expect(message).toContain("an uppercase letter");
    expect(message).toContain("a special character");
    expect(message).not.toContain("lowercase");
  });

  it("does not require a digit (not part of the official rule)", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual(["length", "upper", "lower", "special"]);
    expect(passwordSchema.safeParse("Password!x").success).toBe(true);
  });
});

describe("money and rate inputs stay decimal strings", () => {
  it("accepts up to two decimals", () => {
    expect(moneyString().safeParse("1560").success).toBe(true);
    expect(moneyString().safeParse("1560.5").success).toBe(true);
    expect(moneyString().safeParse("1560.50").success).toBe(true);
  });
  it("rejects negatives, three decimals and text", () => {
    expect(moneyString().safeParse("-1").success).toBe(false);
    expect(moneyString().safeParse("1.234").success).toBe(false);
    expect(moneyString().safeParse("abc").success).toBe(false);
    expect(moneyString().safeParse("").success).toBe(false);
  });
  it("caps tax rates at 100%", () => {
    expect(rateString.safeParse("18").success).toBe(true);
    expect(rateString.safeParse("12.5").success).toBe(true);
    expect(rateString.safeParse("100.001").success).toBe(false);
    expect(rateString.safeParse("101").success).toBe(false);
  });
});
