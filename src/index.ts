import { config } from "./config/config.js";

import { BackendPool } from "./backend/backend-pool.js";
import { RoundRobin } from "./balancer/round-robin.js";
import { HealthChecker } from "./health/health-checker.js";
import { Proxy } from "./proxy/proxy.js";
import { createApp } from "./server/app.js";

const backendPool = new BackendPool(config.backends);

const balancer = new RoundRobin(backendPool);

const healthChecker = new HealthChecker(
  backendPool,
  config.healthCheck.interval,
  config.healthCheck.timeout,
  config.healthCheck.path,
);

const proxy = new Proxy();

const app = createApp({
  backendPool,
  balancer,
  proxy,
});

await healthChecker.checkAll();

healthChecker.start();

const server = app.listen(config.port, () => {
  console.log(`Load balancer listening on port ${config.port}`);
  console.table(backendPool.getAll());
});

const shutDown = () => {
  console.log("Shutting down...");

  healthChecker.stop();

  server.close(() => {
    console.log("Load balancer stopped");
    process.exit(0);
  });
};

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
