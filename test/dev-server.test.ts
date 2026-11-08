import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { getFreePort, withTimeout } from "./helpers.js";

const DEV_SERVER = fileURLToPath(
  new URL("../src/backend/dev-server.ts", import.meta.url),
);

let child: ChildProcess | undefined;

afterEach(() => {
  child?.kill();
  child = undefined;
});

/** Starts the dev server on `port` and waits until it reports that it is listening. */
async function startDevServer(port: number): Promise<void> {
  const proc = spawn(process.execPath, ["--import", "tsx", DEV_SERVER, String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child = proc;

  let output = "";

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      proc.stdout?.on("data", (chunk) => {
        output += chunk;
        if (output.includes(`listening on port ${port}`)) resolve();
      });
      proc.stderr?.on("data", (chunk) => {
        output += chunk;
      });
      proc.on("exit", (code) => {
        reject(
          new Error(`Dev server exited (code ${code}) before listening:\n${output}`),
        );
      });
    }),
    10_000,
  );
}

describe("dev server", () => {
  it("listens on the port given on the command line", { timeout: 15_000 }, async () => {
    const port = await getFreePort();
    await startDevServer(port);

    const res = await fetch(`http://127.0.0.1:${port}/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "healthy", port });
  });

  it("answers other paths with a hello message", { timeout: 15_000 }, async () => {
    const port = await getFreePort();
    await startDevServer(port);

    const res = await fetch(`http://127.0.0.1:${port}/anything`);

    expect(await res.text()).toBe(`Hello from backend server running on port ${port}`);
  });
});
