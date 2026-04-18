export class PromisePool<T = unknown> {
  private readonly promises: Set<Promise<T>>;
  private readonly resumeFunctions: Array<(() => void) | undefined>;
  private resumeFunctionIndex: number;
  private reservedPromiseCount: number;
  private _concurrency: number;
  private _queuedPromiseCount: number;

  constructor(concurrency = 10) {
    this._concurrency = concurrency;
    this._queuedPromiseCount = 0;
    this.promises = new Set();
    this.resumeFunctions = [];
    this.resumeFunctionIndex = 0;
    this.reservedPromiseCount = 0;
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
    return Promise.all(this.promises);
  }

  promiseAllSettled(): Promise<PromiseSettledResult<T>[]> {
    return Promise.allSettled(this.promises);
  }

  async run(startPromise: () => Promise<T>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    await this.privateRunAndWaitForReturnValue(startPromise);
  }

  async runAndWaitForReturnValue<R extends T>(startPromise: () => Promise<R>): Promise<R> {
    const [promise] = await this.privateRunAndWaitForReturnValue(startPromise);
    return await promise;
  }

  private async privateRunAndWaitForReturnValue<R extends T>(startPromise: () => Promise<R>): Promise<[Promise<R>]> {
    this._queuedPromiseCount++;
    await this.waitForCapacity();

    let promise: Promise<R>;
    try {
      promise = startPromise().finally(() => {
        this._queuedPromiseCount--;
        this.promises.delete(promise);
        this.resume();
      });
    } catch (error) {
      this._queuedPromiseCount--;
      this.reservedPromiseCount--;
      this.resume();
      throw error;
    }

    this.reservedPromiseCount--;
    this.promises.add(promise);
    // Don't return the promise as is since run() wants to ignore the return value.
    return [promise];
  }

  private async waitForCapacity(): Promise<void> {
    if (this.hasCapacity()) {
      this.reservedPromiseCount++;
      return;
    }

    await new Promise<void>((resolve) => {
      this.resumeFunctions.push(resolve);
    });
  }

  private resume(): void {
    while (this.hasCapacity()) {
      const resumeFunctionIndex = this.resumeFunctionIndex;
      const resumeFunction = this.resumeFunctions[resumeFunctionIndex];
      if (!resumeFunction) break;

      this.resumeFunctionIndex++;
      this.resumeFunctions[resumeFunctionIndex] = undefined;
      this.reservedPromiseCount++;
      resumeFunction();
    }

    if (this.resumeFunctionIndex === this.resumeFunctions.length) {
      this.resumeFunctions.length = 0;
      this.resumeFunctionIndex = 0;
    } else if (this.resumeFunctionIndex >= 256 && this.resumeFunctionIndex >= this.resumeFunctions.length / 2) {
      this.resumeFunctions.splice(0, this.resumeFunctionIndex);
      this.resumeFunctionIndex = 0;
    }
  }

  private hasCapacity(): boolean {
    return this.promises.size + this.reservedPromiseCount < this._concurrency;
  }
}
