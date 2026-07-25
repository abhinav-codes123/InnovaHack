import { describe, expect, it } from "vitest";
import { compareContexts } from "./context.js";

describe("compareContexts", () => {
  it("detects meaningful contextual differences", () => {
    const result = compareContexts(
      { subject: "battery warranty", time: "8 years", location: "United States" },
      { subject: "battery usable life", time: "15 years", location: "Europe" }
    );

    expect(result.sameContext).toBe(false);
    expect(result.differences).toHaveLength(3);
  });

  it("does not invent differences when context is missing", () => {
    const result = compareContexts(
      { subject: "passenger vehicles" },
      { subject: "Passenger Vehicles", time: "2024" }
    );

    expect(result.sameContext).toBe(true);
  });
});
