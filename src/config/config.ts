import type { Backend } from "../types/backend.js";

export const config = {
  port: 8181,

  healthCheck: {
    interval: 5_000,
    timeout: 2_000,
    path: "/health",
  },

  backends: [
    {
      id: "server-1",
      url: "http://localhost:3000",
      healthy: false,
    },
    {
      id: "server-2",
      url: "http://localhost:3001",
      healthy: false,
    },
    {
      id: "server-3",
      url: "http://localhost:3002",
      healthy: false,
    },
  ] satisfies Backend[],
};
