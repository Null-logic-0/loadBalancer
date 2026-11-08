import type { RequestListener } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendPool } from "../src/backend/backend-pool.js";
import { RoundRobin } from "../src/balancer/round-robin.js";
import { Proxy } from "../src/proxy/proxy.js";
import { createApp } from "../src/server/app.js";
import { readBody, startServer, type TestServer } from "./helpers.js";

const servers: TestServer[] = [];

async function serve(handler: RequestListener): Promise<TestServer> {
  const server = await startServer(handler);
  servers.push(server);
  return server;
}

/** A backend that answers with its own name, plus the request body if there is one. */
function named(name: string): RequestListener {
  return async (req, res) => {
    const body = await readBody(req);
    res.end(body ? `${name}:${body}` : name);
  };
}

/** Two healthy backends ("one" and "two") behind a load balancer app. */
async function setup() {
  const one = await serve(named("one"));
  const two = await serve(named("two"));

  const pool = new BackendPool([
    { id: "server-1", url: one.url, healthy: true },
    { id: "server-2", url: two.url, healthy: true },
  ]);

  const app = createApp({
    backendPool: pool,
    balancer: new RoundRobin(pool),
    proxy: new Proxy(),
  });

  const lb = await serve(app);

  return { pool, lb, one, two };
}

async function getText(url: string): Promise<string> {
  return (await fetch(url)).text();
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("createApp()", () => {
  it("answers GET /health itself", async () => {
    const { lb } = await setup();

    const res = await fetch(`${lb.url}/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("lists every backend and its health at GET /backends", async () => {
    const { lb, pool, one, two } = await setup();
    pool.setHealth("server-2", false);

    const res = await fetch(`${lb.url}/backends`);

    expect(await res.json()).toEqual([
      { id: "server-1", url: one.url, healthy: true },
      { id: "server-2", url: two.url, healthy: false },
    ]);
  });

  it("spreads requests across healthy backends in turn", async () => {
    const { lb } = await setup();

    const names: string[] = [];
    for (let i = 0; i < 4; i++) {
      names.push(await getText(`${lb.url}/`));
    }

    expect(names).toEqual(["one", "two", "one", "two"]);
  });

  it("sends traffic only to healthy backends", async () => {
    const { lb, pool } = await setup();
    pool.setHealth("server-1", false);

    const names: string[] = [];
    for (let i = 0; i < 3; i++) {
      names.push(await getText(`${lb.url}/`));
    }

    expect(names).toEqual(["two", "two", "two"]);
  });

  it("returns 503 when no backend is healthy", async () => {
    const { lb, pool } = await setup();
    pool.setHealth("server-1", false);
    pool.setHealth("server-2", false);

    const res = await fetch(`${lb.url}/`);

    expect(res.status).toBe(503);
    expect(await res.text()).toBe("No healthy backend available");
  });

  it("proxies request bodies to the backend", async () => {
    const { lb } = await setup();

    const res = await fetch(`${lb.url}/echo`, { method: "POST", body: "hello" });

    expect(await res.text()).toBe("one:hello");
  });

  it("logs which backend handled each request", async () => {
    const { lb } = await setup();

    await getText(`${lb.url}/orders?page=2`);

    expect(console.log).toHaveBeenCalledWith("GET /orders?page=2 -> server-1");
  });
});
