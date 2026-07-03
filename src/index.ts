// Shared by all fast-path run() calls to avoid allocating a new promise per call.
const RESOLVED_PROMISE = Promise.resolve();

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

  run(startPromise: () => Promise<T>): Promise<void> {
    this._queuedPromiseCount++;
    // Start the task synchronously when the pool has capacity to avoid the
    // promise allocations and microtask hops of the queued (slow) path.
    if (this.tryReserveCapacity()) {
      try {
        void this.startReservedTask(startPromise);
      } catch (error) {
        return Promise.reject(error);
      }
      return RESOLVED_PROMISE;
    }
    return this.runQueued(startPromise);
  }

  runAndWaitForReturnValue<R extends T>(startPromise: () => Promise<R>): Promise<R> {
    this._queuedPromiseCount++;
    if (this.tryReserveCapacity()) {
      try {
        return this.startReservedTask(startPromise);
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return this.runQueuedAndWaitForReturnValue(startPromise);
  }

  private async runQueued(startPromise: () => Promise<T>): Promise<void> {
    while (!this.tryReserveCapacity()) {
      await this.waitForResume();
      if (this.tryKeepReservedSlot()) break;
    }
    // The started promise is intentionally discarded since run() resolves once the task starts.
    void this.startReservedTask(startPromise);
  }

  private async runQueuedAndWaitForReturnValue<R extends T>(startPromise: () => Promise<R>): Promise<R> {
    while (!this.tryReserveCapacity()) {
      await this.waitForResume();
      if (this.tryKeepReservedSlot()) break;
    }
    // The async function awaits the returned promise, so the caller receives the task's resolved value.
    return this.startReservedTask(startPromise);
  }

  /**
   * Starts the given task using a slot the caller has already reserved.
   * The reservation is converted into a working promise, or released if `startPromise` throws.
   */
  private startReservedTask<R extends T>(startPromise: () => Promise<R>): Promise<R> {
    let promise: Promise<R>;
    try {
      // Use `.then()` with two handlers instead of `.finally()` since `.finally()` allocates extra internal promises.
      promise = startPromise().then(
        (value) => {
          this.completeTask(promise);
          return value;
        },
        (error: unknown) => {
          this.completeTask(promise);
          throw error;
        }
      );
    } catch (error) {
      this._queuedPromiseCount--;
      this.reservedPromiseCount--;
      this.resume();
      throw error;
    }
    this.reservedPromiseCount--;
    this.promises.add(promise);
    return promise;
  }

  private tryReserveCapacity(): boolean {
    if (this.promises.size + this.reservedPromiseCount >= this._concurrency) {
      return false;
    }
    this.reservedPromiseCount++;
    return true;
  }

  // This is not an async function so that awaiting it costs no extra promise beyond the waiter itself.
  private waitForResume(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resumeFunctions.push(resolve);
    });
  }

  /**
   * Decides whether the slot reserved by resume() can be kept, releasing it otherwise.
   * The check happens after a microtask hop so that a concurrency reduction applied
   * right after resume() can still cancel stale reservations.
   */
  private tryKeepReservedSlot(): boolean {
    if (this.promises.size + this.reservedPromiseCount <= this._concurrency) {
      return true;
    }
    this.reservedPromiseCount--;
    return false;
  }

  private completeTask(promise: Promise<T>): void {
    this._queuedPromiseCount--;
    this.promises.delete(promise);
    this.resume();
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
