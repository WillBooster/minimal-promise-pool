export class PromisePool<T = unknown> {
  private readonly concurrency: number;
  private readonly promises: Map<number, Promise<T>>;
  private nextIndex: number;

  constructor(concurrency = 10) {
    this.concurrency = concurrency;
    this.promises = new Map();
    this.nextIndex = 0;
  }

  promiseAll(): Promise<T[]> {
    return Promise.all(this.promises.values());
  }

  async run(startPromise: () => Promise<T>): Promise<void> {
    while (this.promises.size >= this.concurrency) {
      await sleep(1);
    }
    const index = this.nextIndex++;
    this.promises.set(
      index,
      startPromise().finally(() => this.promises.delete(index))
    );
  }
}

export async function sleep(milliseconds: number): Promise<void> {
  return new Promise((r) => setTimeout(r, milliseconds));
}
