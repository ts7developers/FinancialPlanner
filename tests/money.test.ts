import { describe, expect, it } from "vitest";
import { AUDAxis } from "@/lib/money";

describe("AUDAxis", () => {
  it("shows plain dollars below $1k, not a fractional 'k' label", () => {
    expect(AUDAxis(577)).toBe("$577");
    expect(AUDAxis(150)).toBe("$150");
    expect(AUDAxis(0)).toBe("$0");
  });

  it("switches to a rounded 'k' label at $1k and above", () => {
    expect(AUDAxis(1000)).toBe("$1k");
    expect(AUDAxis(34500)).toBe("$35k");
  });

  it("preserves the sign", () => {
    expect(AUDAxis(-500)).toBe("-$500");
    expect(AUDAxis(-2000)).toBe("-$2k");
  });
});
