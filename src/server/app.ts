import express from "express";

import type { BackendPool } from "../backend/backend-pool.js";
import type { RoundRobin } from "../balancer/round-robin.js";
import type { Proxy } from "../proxy/proxy.js";

interface AppDependencies {
  backendPool: BackendPool;
  balancer: RoundRobin;
  proxy: Proxy;
}

export function createApp({ backendPool, balancer, proxy }: AppDependencies) {
  const app = express();

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
    });
  });

  app.get("/backends", (_req, res) => {
    res.json(backendPool.getAll());
  });

  app.use(async (req, res) => {
    const backend = balancer.next();

    if (!backend) {
      return res.status(503).send("No healthy backend available");
    }

    console.log(`${req.method} ${req.url} -> ${backend.id}`);

    try {
      await proxy.forward(req, res, backend.url);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        res.status(502).send("Bad Gateway");
      }
    }
  });

  return app;
}
