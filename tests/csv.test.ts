import { describe, expect, it } from "vitest";
import { parseCSV, parseFlexibleDate, parseAmount, parseBankCSV, isLikelyDuplicateTransaction, escapeCSVField, toCSV } from "@/lib/csv";

describe("parseCSV", () => {
  it("splits a simple comma-separated file into rows/fields", () => {
    expect(parseCSV("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields containing commas and escaped quotes", () => {
    expect(parseCSV('Date,Description,Amount\n2026-08-10,"Woolworths, Chatswood",-52.30\n2026-08-11,"She said ""hi""",-10')).toEqual([
      ["Date", "Description", "Amount"],
      ["2026-08-10", "Woolworths, Chatswood", "-52.30"],
      ["2026-08-11", 'She said "hi"', "-10"],
    ]);
  });

  it("handles CRLF line endings and drops a trailing blank line", () => {
    expect(parseCSV("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseFlexibleDate", () => {
  it("passes through ISO dates", () => {
    expect(parseFlexibleDate("2026-08-14")).toBe("2026-08-14");
  });

  it("converts AU-style DD/MM/YYYY", () => {
    expect(parseFlexibleDate("14/08/2026")).toBe("2026-08-14");
  });

  it("converts DD-MM-YY with a 2-digit year", () => {
    expect(parseFlexibleDate("14-08-26")).toBe("2026-08-14");
  });

  it("is null for garbage input", () => {
    expect(parseFlexibleDate("not a date")).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
  });
});

describe("parseAmount", () => {
  it("parses a plain negative number", () => {
    expect(parseAmount("-52.30")).toBe(-52.3);
  });

  it("strips currency symbols and thousands separators", () => {
    expect(parseAmount("$1,234.56")).toBe(1234.56);
  });

  it("treats accounting-style parentheses as negative", () => {
    expect(parseAmount("(52.30)")).toBe(-52.3);
  });

  it("is null for non-numeric input", () => {
    expect(parseAmount("n/a")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("parseBankCSV", () => {
  it("parses a Date/Description/Amount export, treating negatives as debits and excluding credits", () => {
    const csv = ["Date,Description,Amount", "14/08/2026,Woolworths,-52.30", "15/08/2026,Salary,1500.00", "16/08/2026,BP Fuel,-80"].join("\n");
    const result = parseBankCSV(csv);
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([
      { date: "2026-08-14", description: "Woolworths", amount: 52.3, rawDate: "14/08/2026", rawAmount: "-52.30" },
      { date: "2026-08-15", description: "Salary", amount: null, rawDate: "15/08/2026", rawAmount: "1500.00" },
      { date: "2026-08-16", description: "BP Fuel", amount: 80, rawDate: "16/08/2026", rawAmount: "-80" },
    ]);
  });

  it("treats every Amount as a debit when the file has no negative values at all", () => {
    const csv = ["Date,Description,Amount", "14/08/2026,Woolworths,52.30", "16/08/2026,BP Fuel,80"].join("\n");
    const result = parseBankCSV(csv);
    expect(result.rows.map((r) => r.amount)).toEqual([52.3, 80]);
  });

  it("supports a Debit/Credit split instead of a signed Amount column", () => {
    const csv = ["Date,Description,Debit,Credit", "14/08/2026,Woolworths,52.30,", "15/08/2026,Salary,,1500.00"].join("\n");
    const result = parseBankCSV(csv);
    expect(result.rows.map((r) => r.amount)).toEqual([52.3, null]);
  });

  it("flags an unrecognized header instead of guessing", () => {
    const csv = ["Foo,Bar", "1,2"].join("\n");
    expect(parseBankCSV(csv).error).toMatch(/date column/);
  });

  it("errors on a file with no data rows", () => {
    expect(parseBankCSV("Date,Description,Amount").error).toMatch(/data rows/);
  });
});

describe("isLikelyDuplicateTransaction", () => {
  const existing = [{ date: "2026-08-14", amount: 52.3 }];

  it("flags a same-date same-amount match", () => {
    expect(isLikelyDuplicateTransaction("2026-08-14", 52.3, existing)).toBe(true);
  });

  it("doesn't flag a different date or amount", () => {
    expect(isLikelyDuplicateTransaction("2026-08-15", 52.3, existing)).toBe(false);
    expect(isLikelyDuplicateTransaction("2026-08-14", 10, existing)).toBe(false);
  });
});

describe("escapeCSVField", () => {
  it("leaves a plain field alone", () => {
    expect(escapeCSVField("Groceries")).toBe("Groceries");
  });

  it("quotes a field containing a comma", () => {
    expect(escapeCSVField("Woolworths, Chatswood")).toBe('"Woolworths, Chatswood"');
  });

  it("quotes and doubles embedded quotes", () => {
    expect(escapeCSVField('She said "hi"')).toBe('"She said ""hi"""');
  });

  it("quotes a field containing a newline", () => {
    expect(escapeCSVField("line one\nline two")).toBe('"line one\nline two"');
  });
});

describe("toCSV", () => {
  it("builds a header + data rows with CRLF line endings", () => {
    const csv = toCSV(["Date", "Description", "Amount"], [["2026-08-14", "Woolworths", 52.3]]);
    expect(csv).toBe("Date,Description,Amount\r\n2026-08-14,Woolworths,52.3\r\n");
  });

  it("round-trips through parseCSV for a field that needs quoting", () => {
    const csv = toCSV(["Description"], [["Woolworths, Chatswood"]]);
    expect(parseCSV(csv)).toEqual([["Description"], ["Woolworths, Chatswood"]]);
  });
});
