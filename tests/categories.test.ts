import { describe, expect, it } from "vitest";
import { slugifyCategoryKey, OTHER_CATEGORY_KEY } from "@/lib/categories";

describe("slugifyCategoryKey", () => {
  it("lowercases and underscores a simple label", () => {
    expect(slugifyCategoryKey("Subscriptions", [])).toBe("subscriptions");
  });

  it("collapses punctuation and spaces into single underscores, trimming the ends", () => {
    expect(slugifyCategoryKey("  Car Insurance!! ", [])).toBe("car_insurance");
  });

  it("falls back to a generic key when the label has no usable characters", () => {
    expect(slugifyCategoryKey("!!!", [])).toBe("category");
  });

  it("avoids colliding with an existing key by appending a number", () => {
    expect(slugifyCategoryKey("Fuel", ["fuel"])).toBe("fuel_2");
    expect(slugifyCategoryKey("Fuel", ["fuel", "fuel_2"])).toBe("fuel_3");
  });

  it("avoids colliding with the reserved 'other' catch-all key", () => {
    expect(slugifyCategoryKey("Other", [])).toBe(`${OTHER_CATEGORY_KEY}_2`);
  });
});
