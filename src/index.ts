export class PromisePool<T = unknown> {
  private readonly concurrency: number;
  private readonly promises: Promise<T>[];
  private nextIndex: number;

  constructor(concurrency = 10) {
    this.concurrency = concurrency;
    this.promises = Array(concurrency);
    this.nextIndex = 0;
  }

  promiseAll(): Promise<T[]> {
    return Promise.all(this.promises);
  }

  async run(startPromise: () => Promise<T>): Promise<void> {
    while (this.nextIndex >= this.concurrency) {
      await sleep(1);
    }
    const index = this.nextIndex++;
    this.promises[index] = startPromise();
    (async () => {
      await this.promises[index];
      this.nextIndex--;
      const lastPromise = this.promises[this.nextIndex];
      if (lastPromise && index < this.nextIndex) {
        this.promises[index] = lastPromise;
      }
    })().then();
  }
}

export async function sleep(milliseconds: number): Promise<void> {
  return new Promise((r) => setTimeout(r, milliseconds));
}
