export class PromisePool<T = unknown> {
  private readonly promises: Set<Promise<T>>;
  private waitingPromise: Promise<void> | undefined;
  private resumeFunction: (() => void) | undefined;
  private _concurrency: number;
  private _queuedPromiseCount: number;

  constructor(concurrency = 10) {
    this._concurrency = concurrency;
    this._queuedPromiseCount = 0;
    this.promises = new Set();
  }

  get workingPromiseCount(): number {
    return this.promises.size;
  }

  get concurrency(): number {
    return this._concurrency;
  }

  set concurrency(concurrency: number) {
    const oldConcurrency = this._concurrency;
    this._concurrency = concurrency;
    if (concurrency > oldConcurrency) {
      this.resume();
    }
  }

  get queuedPromiseCount(): number {
    return this._queuedPromiseCount;
  }

  promiseAll(): Promise<T[]> {
    return Promise.all(this.promises.values());
  }

  promiseAllSettled(): Promise<PromiseSettledResult<T>[]> {
    return Promise.all(
      [...this.promises.values()].map((promise: Promise<T>) =>
        promise
          .then((value) => ({ status: 'fulfilled', value }) as PromiseFulfilledResult<T>)
          .catch((error) => ({ status: 'rejected', reason: error }) as PromiseRejectedResult)
      )
    );
  }

  async run(startPromise: () => Promise<T>): Promise<void> {
    this._queuedPromiseCount++;
    while (this.promises.size >= this._concurrency) {
      this.waitingPromise ??= new Promise<void>((resolve) => {
        this.resumeFunction = resolve;
      });
      await this.waitingPromise;
    }
    const promise = startPromise().finally(() => {
      this._queuedPromiseCount--;
      this.promises.delete(promise);
      this.resume();
    });
    this.promises.add(promise);
  }

  private resume(): void {
    if (!this.resumeFunction) return;

    this.resumeFunction();
    this.waitingPromise = undefined;
    this.resumeFunction = undefined;
  }
}
