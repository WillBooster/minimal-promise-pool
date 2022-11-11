export class PromisePool<T = unknown> {
  private readonly promises: Set<Promise<T>>;
  private _concurrency: number;

  constructor(concurrency = 10) {
    this._concurrency = concurrency;
    this.promises = new Set();
  }

  promiseAll(): Promise<T[]> {
    return Promise.all(this.promises.values());
  }

  get concurrency(): number {
    return this._concurrency;
  }

  set concurrency(concurrency: number) {
    this._concurrency = concurrency;
  }

  async run(startPromise: () => Promise<T>): Promise<void> {
    while (this.promises.size >= this._concurrency) {
      await sleep(1);
    }
    const promise = startPromise().finally(() => this.promises.delete(promise));
    this.promises.add(promise);
  }
}

export async function sleep(milliseconds: number): Promise<void> {
  return new Promise((r) => setTimeout(r, milliseconds));
}
