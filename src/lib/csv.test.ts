import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("escapes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("x\ny")).toBe('"x\ny"');
  });
  it("neutralises formulas but keeps negative numbers", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-12.50")).toBe("-12.50");
  });
  it("joins rows", () => {
    expect(toCsv([["a", 1]])).toBe("﻿a,1\r\n");
  });
});
