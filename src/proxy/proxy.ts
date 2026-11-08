import http from "node:http";
import https from "node:https";

import type { IncomingMessage, ServerResponse } from "node:http";

export class Proxy {
  async forward(
    req: IncomingMessage,
    res: ServerResponse,
    backendUrl: string,
  ): Promise<void> {
    const backend = new URL(backendUrl);

    const transport = backend.protocol === "https:" ? https : http;

    const proxyRequest = transport.request(
      {
        protocol: backend.protocol,
        hostname: backend.hostname,
        port: backend.port,
        path: req.url ?? "/",
        method: req.method,
        headers: {
          ...req.headers,
          host: backend.host,
        },
      },

      (proxyResponse) => {
        res.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);

        proxyResponse.pipe(res);
      },
    );

    proxyRequest.setTimeout(5_000, () => {
      proxyRequest.destroy(new Error("Backend request timed out"));
    });

    proxyRequest.on("error", (error) => {
      console.error("Proxy error:", error.message);

      if (!res.headersSent) {
        res.writeHead(502, {
          "Content-Type": "text/plain",
        });

        res.end("Bad Gateway");
      } else {
        res.destroy(error);
      }
    });

    res.on("close", () => {
      if (!res.writableFinished) proxyRequest.destroy();
    });

    req.pipe(proxyRequest);
  }
}
