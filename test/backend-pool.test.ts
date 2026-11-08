import { describe, expect, it } from "vitest";

import { BackendPool } from "../src/backend/backend-pool.js";
import type { Backend } from "../src/types/backend.js";

function makeBackends(): Backend[] {
  return [
    { id: "a", url: "http://127.0.0.1:3000", healthy: true },
    { id: "b", url: "http://127.0.0.1:3001", healthy: false },
    { id: "c", url: "http://127.0.0.1:3002", healthy: true },
  ];
}

const ids = (backends: Backend[]) => backends.map((backend) => backend.id);

describe("BackendPool", () => {
  it("returns every backend from getAll()", () => {
    const pool = new BackendPool(makeBackends());

    expect(ids(pool.getAll())).toEqual(["a", "b", "c"]);
  });

  it("returns only healthy backends from getHealthy()", () => {
    const pool = new BackendPool(makeBackends());

    expect(ids(pool.getHealthy())).toEqual(["a", "c"]);
  });

  it("returns an empty list when no backend is healthy", () => {
    const pool = new BackendPool(
      makeBackends().map((backend) => ({ ...backend, healthy: false })),
    );

    expect(pool.getHealthy()).toEqual([]);
  });

  it("marks backends healthy or unhealthy with setHealth()", () => {
    const pool = new BackendPool(makeBackends());

    pool.setHealth("b", true);
    pool.setHealth("a", false);

    expect(ids(pool.getHealthy())).toEqual(["b", "c"]);
  });

  it("ignores setHealth() for an unknown id", () => {
    const pool = new BackendPool(makeBackends());

    expect(() => pool.setHealth("missing", true)).not.toThrow();
    expect(ids(pool.getHealthy())).toEqual(["a", "c"]);
  });
});
