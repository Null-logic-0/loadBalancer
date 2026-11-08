import type { Backend } from "../types/backend.js";

export class BackendPool {
  private readonly backends: Backend[];

  constructor(backends: Backend[]) {
    this.backends = backends;
  }

  getAll(): Backend[] {
    return this.backends;
  }

  getHealthy(): Backend[] {
    return this.backends.filter((backend) => backend.healthy);
  }

  setHealth(id: string, healthy: boolean): void {
    const backend = this.backends.find((backend) => backend.id === id);

    if (!backend) return;

    backend.healthy = healthy;
  }
}
