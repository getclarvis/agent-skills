import { afterEach, describe, expect, it, vi } from "vitest";
import { setWarnSink, warn } from "../../src/lib/log.js";

describe("warn / setWarnSink", () => {
  afterEach(() => setWarnSink(null));

  it("writes to stderr by default", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      warn("a message\n");
      expect(spy).toHaveBeenCalledWith("a message\n");
    } finally {
      spy.mockRestore();
    }
  });

  it("redirects to a custom sink and restores the default when set to null", () => {
    const seen: string[] = [];
    setWarnSink((m) => seen.push(m));
    warn("captured");
    expect(seen).toEqual(["captured"]);

    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      setWarnSink(null);
      warn("back to stderr");
      expect(spy).toHaveBeenCalledWith("back to stderr");
    } finally {
      spy.mockRestore();
    }
  });
});
