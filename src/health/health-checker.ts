import { BackendPool } from "../backend/backend-pool.js";

export class HealthChecker {
  private timer?: ReturnType<typeof setInterval>;
  private checking = false;

  constructor(
    private readonly backendPool: BackendPool,
    private readonly interval: number,
    private readonly timeout: number,
    private readonly path: string,
  ) {}

  async checkAll(): Promise<void> {
    if (this.checking) return;
    this.checking = true;

    try {
      const backends = this.backendPool.getAll();

      await Promise.all(
        backends.map(async (backend) => {
          try {
            const url = new URL(this.path, backend.url);

            const response = await fetch(url, {
              signal: AbortSignal.timeout(this.timeout),
            });

            const healthy = response.status === 200;

            this.backendPool.setHealth(backend.id, healthy);
            await response.body?.cancel();
          } catch {
            this.backendPool.setHealth(backend.id, false);
          }
        }),
      );
    } finally {
      this.checking = false;
    }
  }

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      void this.checkAll();
    }, this.interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
