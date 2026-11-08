import http, { type RequestListener } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Proxy } from "../src/proxy/proxy.js";
import {
  getFreePort,
  readBody,
  startServer,
  withTimeout,
  type TestServer,
} from "./helpers.js";

interface Echo {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

const servers: TestServer[] = [];

async function serve(handler: RequestListener): Promise<TestServer> {
  const server = await startServer(handler);
  servers.push(server);
  return server;
}

/** Starts a server that forwards every request to `backendUrl` through Proxy. */
function serveProxy(backendUrl: string): Promise<TestServer> {
  const proxy = new Proxy();

  return serve((req, res) => {
    void proxy.forward(req, res, backendUrl);
  });
}

/** A backend that replies with a JSON description of the request it received. */
const echo: RequestListener = async (req, res) => {
  const body = await readBody(req);

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body }),
  );
};

/** Sends a GET with the request path exactly as given (fetch would normalise it). */
function rawGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path }, async (res) => {
        resolve({ status: res.statusCode ?? 0, body: await readBody(res) });
      })
      .on("error", reject);
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("Proxy.forward()", () => {
  it("forwards the method, path and query string", async () => {
    const backend = await serve(echo);
    const proxy = await serveProxy(backend.url);

    const res = await fetch(`${proxy.url}/users/42?active=true`, { method: "DELETE" });
    const got = (await res.json()) as Echo;

    expect(got.method).toBe("DELETE");
    expect(got.url).toBe("/users/42?active=true");
  });

  it("forwards the request body", async () => {
    const backend = await serve(echo);
    const proxy = await serveProxy(backend.url);
    const payload = JSON.stringify({ name: "widget", qty: 3 });

    const res = await fetch(`${proxy.url}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    const got = (await res.json()) as Echo;

    expect(got.body).toBe(payload);
    expect(got.headers["content-type"]).toBe("application/json");
  });

  it("streams large request bodies through intact", async () => {
    const backend = await serve(echo);
    const proxy = await serveProxy(backend.url);
    const payload = "x".repeat(2 * 1024 * 1024);

    const res = await fetch(`${proxy.url}/upload`, { method: "PUT", body: payload });
    const got = (await res.json()) as Echo;

    expect(got.body.length).toBe(payload.length);
    expect(got.body === payload).toBe(true);
  });

  it("forwards client headers and sets Host to the backend", async () => {
    const backend = await serve(echo);
    const proxy = await serveProxy(backend.url);

    const res = await fetch(proxy.url, {
      headers: { "x-request-id": "abc-123", authorization: "Bearer token" },
    });
    const got = (await res.json()) as Echo;

    expect(got.headers["x-request-id"]).toBe("abc-123");
    expect(got.headers.authorization).toBe("Bearer token");
    expect(got.headers.host).toBe(new URL(backend.url).host);
  });

  it("returns the backend's status, headers and body to the client", async () => {
    const backend = await serve((_req, res) => {
      res.writeHead(201, { "content-type": "text/plain", "x-backend": "one" });
      res.end("created");
    });
    const proxy = await serveProxy(backend.url);

    const res = await fetch(`${proxy.url}/items`, { method: "POST" });

    expect(res.status).toBe(201);
    expect(res.headers.get("x-backend")).toBe("one");
    expect(await res.text()).toBe("created");
  });

  it("passes backend error responses through instead of turning them into 502s", async () => {
    const backend = await serve((_req, res) => {
      res.writeHead(404).end("not here");
    });
    const proxy = await serveProxy(backend.url);

    const res = await fetch(`${proxy.url}/missing`);

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("not here");
  });

  it("responds 502 Bad Gateway when the backend is unreachable", async () => {
    const proxy = await serveProxy(`http://127.0.0.1:${await getFreePort()}`);

    const res = await fetch(`${proxy.url}/anything`);

    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Bad Gateway");
    expect(console.error).toHaveBeenCalledWith("Proxy error:", expect.any(String));
  });

  it("keeps requests on the configured backend when the path starts with //", async () => {
    const backend = await serve(echo);
    let internalHits = 0;
    const internal = await serve((_req, res) => {
      internalHits++;
      res.end("internal secret");
    });
    const proxy = await serveProxy(backend.url);

    const res = await rawGet(proxy.port, `//127.0.0.1:${internal.port}/admin`);

    expect(internalHits).toBe(0);
    expect(res.body).not.toContain("internal secret");
  });

  it("cancels the backend request when the client disconnects", async () => {
    let markReceived!: () => void;
    const received = new Promise<void>((resolve) => (markReceived = resolve));
    let markClosed!: () => void;
    const backendClosed = new Promise<void>((resolve) => (markClosed = resolve));

    const backend = await serve((_req, res) => {
      res.on("close", () => markClosed());
      markReceived(); // never responds
    });
    const proxy = await serveProxy(backend.url);

    const controller = new AbortController();
    const request = fetch(`${proxy.url}/slow`, { signal: controller.signal }).catch(
      () => {},
    );

    await received;
    controller.abort();
    await request;

    // Without cancellation the backend request lives until the 5s proxy timeout.
    await expect(withTimeout(backendClosed, 1_000)).resolves.toBeUndefined();
  });
});
