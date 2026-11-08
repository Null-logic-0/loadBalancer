import type { Backend } from "../types/backend.js";
import { BackendPool } from "../backend/backend-pool.js";

export class RoundRobin {
  private currentIndex = 0;

  constructor(private readonly backendPool: BackendPool) {}

  next(): Backend | undefined {
    const healthyBackends = this.backendPool.getHealthy();

    if (healthyBackends.length === 0) return undefined;

    const backend = healthyBackends[this.currentIndex % healthyBackends.length];

    this.currentIndex++;

    return backend;
  }
}
