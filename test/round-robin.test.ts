import { describe, expect, it } from "vitest";

import { BackendPool } from "../src/backend/backend-pool.js";
import { RoundRobin } from "../src/balancer/round-robin.js";

/** Builds a pool from `{ id: healthy }` pairs. */
function makePool(health: Record<string, boolean>): BackendPool {
  return new BackendPool(
    Object.entries(health).map(([id, healthy], index) => ({
      id,
      url: `http://127.0.0.1:${3000 + index}`,
      healthy,
    })),
  );
}

/** Calls next() `count` times and returns the picked ids. */
function take(balancer: RoundRobin, count: number): (string | undefined)[] {
  return Array.from({ length: count }, () => balancer.next()?.id);
}

describe("RoundRobin", () => {
  it("returns undefined when no backend is healthy", () => {
    const balancer = new RoundRobin(makePool({ a: false, b: false }));

    expect(balancer.next()).toBeUndefined();
  });

  it("cycles through healthy backends in order", () => {
    const balancer = new RoundRobin(makePool({ a: true, b: true, c: true }));

    expect(take(balancer, 7)).toEqual(["a", "b", "c", "a", "b", "c", "a"]);
  });

  it("skips unhealthy backends", () => {
    const balancer = new RoundRobin(makePool({ a: true, b: false, c: true }));

    expect(take(balancer, 4)).toEqual(["a", "c", "a", "c"]);
  });

  it("starts routing to a backend as soon as it becomes healthy", () => {
    const pool = makePool({ a: false, b: false });
    const balancer = new RoundRobin(pool);

    expect(balancer.next()).toBeUndefined();

    pool.setHealth("b", true);

    expect(take(balancer, 3)).toEqual(["b", "b", "b"]);
  });

  it("stops routing to a backend as soon as it becomes unhealthy", () => {
    const pool = makePool({ a: true, b: true, c: true });
    const balancer = new RoundRobin(pool);

    balancer.next();
    pool.setHealth("b", false);

    const picks = take(balancer, 6);

    expect(picks).not.toContain("b");
    expect(new Set(picks)).toEqual(new Set(["a", "c"]));
  });
});
