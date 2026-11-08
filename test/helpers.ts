import http from "node:http";
import type { AddressInfo } from "node:net";

export interface TestServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

/** Starts an HTTP server on a random free port on 127.0.0.1. */
export async function startServer(
  handler: http.RequestListener,
): Promise<TestServer> {
  const server = http.createServer(handler);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address() as AddressInfo;

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

/** Returns a port that nothing is listening on. */
export async function getFreePort(): Promise<number> {
  const server = await startServer(() => {});
  await server.close();
  return server.port;
}

/** Reads a whole request or response body into a string. */
export async function readBody(message: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of message) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString();
}

/** Rejects if `promise` has not settled within `ms` milliseconds. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
