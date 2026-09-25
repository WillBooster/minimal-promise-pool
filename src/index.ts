// Shared by all fast-path run() calls to avoid allocating a new promise per call.
const RESOLVED_PROMISE = Promise.resolve();

/**
 * A long-lived pool that caps how many tasks run at the same time, e.g., one pool shared across calls to limit
 * process-wide concurrency. Queued tasks start in submission order.
 *
 * `run()` resolves when a task **starts**, not when it finishes. To wait for tasks to finish, pass the promises
 * returned by `runAndWaitForReturnValue()` to `Promise.allSettled()`. For tasks that never reject, awaiting `run()`
 * for every task and then calling `promiseAllSettled()` also works.
 *
 * For a one-shot "run an action for every item with at most N in flight" loop, prefer `forEachConcurrently()` from
 * `@willbooster/shared-lib`, which waits for every item and stops starting new items after the first error.
 */
export class PromisePool<T = unknown> {
  private readonly promises: Set<Promise<T>>;
  private readonly resumeFunctions: Array<(() => void) | undefined>;
  private resumeFunctionIndex: number;
  private reservedPromiseCount: number;
  private _concurrency: number;
  private _queuedPromiseCount: number;

  /** @param concurrency The maximum number of tasks running at the same time. */
  constructor(concurrency = 10) {
    this._concurrency = concurrency;
    this._queuedPromiseCount = 0;
    this.promises = new Set();
    this.resumeFunctions = [];
    this.resumeFunctionIndex = 0;
    this.reservedPromiseCount = 0;
  }

  /** The number of tasks that have started and not yet settled. */
  get workingPromiseCount(): number {
    return this.promises.size;
  }

  /**
   * The maximum number of tasks running at the same time.
   * Lowering it does not stop running tasks; it only delays starting queued ones.
   * Raising it starts queued tasks immediately up to the new limit.
   */
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

  /** The number of tasks submitted and not yet settled, including both waiting and running tasks. */
  get queuedPromiseCount(): number {
    return this._queuedPromiseCount;
  }

  /**
   * Returns `Promise.all()` over the tasks running at the time of the call, so it rejects with the first of their
   * errors without waiting for the other tasks to finish. Tasks still waiting for a slot and tasks that already
   * settled are not included.
   */
  promiseAll(): Promise<T[]> {
    return Promise.all(this.promises);
  }

  /**
   * Returns `Promise.allSettled()` over the tasks running at the time of the call.
   * Tasks still waiting for a slot and tasks that already settled are not included.
   */
  promiseAllSettled(): Promise<PromiseSettledResult<T>[]> {
    return Promise.allSettled(this.promises);
  }

  /**
   * Starts `startPromise` once the pool has a free slot.
   *
   * The returned promise resolves when the task **starts**, not when it finishes, so awaiting it only waits for a free
   * slot. It rejects only when `startPromise` throws synchronously. For tasks that never reject, awaiting `run()` for
   * every task and then calling `promiseAllSettled()` waits until every task finishes.
   *
   * A rejection of the task itself is observable only through `promiseAll()` / `promiseAllSettled()` called while the
   * task is running; otherwise it becomes an unhandled rejection. Use `runAndWaitForReturnValue()` to handle each
   * task's result or error reliably.
   */
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

  /**
   * Starts `startPromise` once the pool has a free slot, and returns a promise that settles with the task's result:
   * it resolves with the task's value or rejects with its error.
   */
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
