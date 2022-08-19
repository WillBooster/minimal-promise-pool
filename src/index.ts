export class PromisePool<T = unknown> {
  private readonly concurrency: number;
  private readonly promises: Set<Promise<T>>;

  constructor(concurrency = 10) {
    this.concurrency = concurrency;
    this.promises = new Set();
  }

  promiseAll(): Promise<T[]> {
    return Promise.all(this.promises.values());
  }

  async run(startPromise: () => Promise<T>): Promise<void> {
    while (this.promises.size >= this.concurrency) {
      await sleep(1);
    }
    const promise = startPromise().finally(() => this.promises.delete(promise));
    this.promises.add(promise);
  }
}

export async function sleep(milliseconds: number): Promise<void> {
  return new Promise((r) => setTimeout(r, milliseconds));
}
