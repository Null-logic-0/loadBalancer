import type { RequestListener } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BackendPool } from "../src/backend/backend-pool.js";
import { HealthChecker } from "../src/health/health-checker.js";
import { getFreePort, startServer, type TestServer } from "./helpers.js";

const servers: TestServer[] = [];

async function serve(handler: RequestListener): Promise<TestServer> {
  const server = await startServer(handler);
  servers.push(server);
  return server;
}

function respondWith(status: number): RequestListener {
  return (_req, res) => {
    res.writeHead(status).end();
  };
}

/** Builds a pool of backends named server-1, server-2, … that start unhealthy. */
function makePool(...urls: string[]): BackendPool {
  return new BackendPool(
    urls.map((url, index) => ({
      id: `server-${index + 1}`,
      url,
      healthy: false,
    })),
  );
}

function healthOf(pool: BackendPool): Record<string, boolean> {
  return Object.fromEntries(
    pool.getAll().map((backend) => [backend.id, backend.healthy]),
  );
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("HealthChecker.checkAll()", () => {
  it("marks a backend healthy when its health path returns 200", async () => {
    const up = await serve(respondWith(200));
    const pool = makePool(up.url);

    await new HealthChecker(pool, 1_000, 500, "/health").checkAll();

    expect(healthOf(pool)).toEqual({ "server-1": true });
  });

  it("requests the configured health path", async () => {
    const paths: (string | undefined)[] = [];
    const up = await serve((req, res) => {
      paths.push(req.url);
      res.writeHead(200).end();
    });

    await new HealthChecker(makePool(up.url), 1_000, 500, "/status/ready").checkAll();

    expect(paths).toEqual(["/status/ready"]);
  });

  it("marks a backend unhealthy when its health path returns a non-200 status", async () => {
    const failing = await serve(respondWith(503));
    const pool = makePool(failing.url);
    pool.setHealth("server-1", true);

    await new HealthChecker(pool, 1_000, 500, "/health").checkAll();

    expect(healthOf(pool)).toEqual({ "server-1": false });
  });

  it("marks a backend unhealthy when nothing is listening", async () => {
    const pool = makePool(`http://127.0.0.1:${await getFreePort()}`);
    pool.setHealth("server-1", true);

    await new HealthChecker(pool, 1_000, 500, "/health").checkAll();

    expect(healthOf(pool)).toEqual({ "server-1": false });
  });

  it("marks a backend unhealthy when the health check times out", async () => {
    const hanging = await serve(() => {}); // never responds
    const pool = makePool(hanging.url);
    pool.setHealth("server-1", true);

    const started = Date.now();
    await new HealthChecker(pool, 1_000, 100, "/health").checkAll();

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(healthOf(pool)).toEqual({ "server-1": false });
  });

  it("marks a backend unhealthy once it goes down", async () => {
    const up = await serve(respondWith(200));
    const pool = makePool(up.url);
    const checker = new HealthChecker(pool, 1_000, 500, "/health");

    await checker.checkAll();
    expect(healthOf(pool)).toEqual({ "server-1": true });

    await up.close();
    await checker.checkAll();
    expect(healthOf(pool)).toEqual({ "server-1": false });
  });

  it("checks each backend independently", async () => {
    const up = await serve(respondWith(200));
    const failing = await serve(respondWith(500));
    const pool = makePool(
      up.url,
      failing.url,
      `http://127.0.0.1:${await getFreePort()}`,
    );

    await new HealthChecker(pool, 1_000, 500, "/health").checkAll();

    expect(healthOf(pool)).toEqual({
      "server-1": true,
      "server-2": false,
      "server-3": false,
    });
  });

  it("skips a round while the previous one is still running", async () => {
    let finish!: () => void;
    const pending = new Promise<Response>((resolve) => {
      finish = () => resolve(new Response(null, { status: 200 }));
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(pending);

    const pool = makePool("http://127.0.0.1:1", "http://127.0.0.1:2");
    const checker = new HealthChecker(pool, 1_000, 500, "/health");

    const first = checker.checkAll();
    const second = checker.checkAll();

    expect(fetchSpy).toHaveBeenCalledTimes(2); // one per backend, not four

    finish();
    await Promise.all([first, second]);
    expect(healthOf(pool)).toEqual({ "server-1": true, "server-2": true });

    await checker.checkAll(); // the next round runs normally
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });
});

describe("HealthChecker.start() / stop()", () => {
  function setup() {
    vi.useFakeTimers();

    const checker = new HealthChecker(
      makePool("http://127.0.0.1:1"),
      1_000,
      500,
      "/health",
    );
    const checkAll = vi.spyOn(checker, "checkAll").mockResolvedValue(undefined);

    return { checker, checkAll };
  }

  it("runs a check every interval after start()", () => {
    const { checker, checkAll } = setup();

    checker.start();
    expect(checkAll).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(checkAll).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3_000);
    expect(checkAll).toHaveBeenCalledTimes(4);

    checker.stop();
  });

  it("stops checking after stop() and can be started again", () => {
    const { checker, checkAll } = setup();

    checker.start();
    vi.advanceTimersByTime(2_000);
    checker.stop();
    vi.advanceTimersByTime(5_000);
    expect(checkAll).toHaveBeenCalledTimes(2);

    checker.start();
    vi.advanceTimersByTime(1_000);
    expect(checkAll).toHaveBeenCalledTimes(3);

    checker.stop();
  });

  it("does not schedule a second timer when start() is called twice", () => {
    const { checker, checkAll } = setup();

    checker.start();
    checker.start();
    vi.advanceTimersByTime(1_000);

    expect(checkAll).toHaveBeenCalledTimes(1);

    checker.stop();
  });
});
