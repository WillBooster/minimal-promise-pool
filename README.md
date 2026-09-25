# minimal-promise-pool

[![npm version](https://img.shields.io/npm/v/minimal-promise-pool.svg)](https://www.npmjs.com/package/minimal-promise-pool)
[![license](https://img.shields.io/npm/l/minimal-promise-pool.svg)](https://www.npmjs.com/package/minimal-promise-pool)
[![Test](https://github.com/WillBooster/minimal-promise-pool/actions/workflows/test.yml/badge.svg)](https://github.com/WillBooster/minimal-promise-pool/actions/workflows/test.yml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![wbfy](https://img.shields.io/badge/wbfy-20.20.0-1e90ff.svg)](https://github.com/WillBooster/shared/tree/main/packages/wbfy)

A minimal, zero-dependency promise pool for limiting the number of concurrently running promises.
For example, `new PromisePool(2)` runs at most two tasks at the same time and queues the rest.

## Features

- **Minimal** — a single class with no runtime dependencies.
- **Typed** — written in TypeScript with full type definitions.
- **Dual package** — ships both ESM and CommonJS builds.
- **FIFO scheduling** — queued tasks start in the order they were submitted.
- **Adjustable concurrency** — change the limit at runtime; the pool adapts immediately.

## When to use

`PromisePool` fits a long-lived pool shared across calls, such as a process-wide cap on concurrent requests to an external service, optionally with a limit adjusted at runtime.

For a one-shot loop that runs an action for every item with at most N in flight, prefer `forEachConcurrently()` from [`@willbooster/shared-lib`](https://www.npmjs.com/package/@willbooster/shared-lib).
It waits for every item, stops starting new items after the first error, and then rejects with that error.

```ts
import { forEachConcurrently } from '@willbooster/shared-lib';

await forEachConcurrently(urls, 5, async (url) => {
  await fetch(url);
});
```

## Installation

```sh
npm install minimal-promise-pool
# or
yarn add minimal-promise-pool
```

## Quick Start

The following example runs at most two tasks concurrently:

```ts
import { PromisePool } from 'minimal-promise-pool';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const promisePool = new PromisePool(2);
for (const name of ['First', 'Second', 'Third']) {
  // Resolves when the task starts, so this waits only while the pool is full.
  await promisePool.run(async () => {
    console.log(`${name} task started`);
    await sleep(10_000);
    console.log(`${name} task finished`);
  });
}
// Waits until the running tasks finish.
await promisePool.promiseAll();
console.log('All tasks finished');
```

Output:

```
First task started
Second task started
# ... about 10 seconds ...
First task finished
Third task started
Second task finished
# ... about 10 seconds ...
Third task finished
All tasks finished
```

## `run()` resolves when the task starts

`run()` resolves when the task **starts**, not when it finishes.
`await promisePool.run(...)` therefore only waits for a free slot.
Without a later `promiseAll()` or `promiseAllSettled()`, the caller continues while tasks are still running:

```ts
// Wrong: the function returns before the tasks finish.
async function processAll(items: Item[]): Promise<void> {
  for (const item of items) {
    await promisePool.run(() => process(item));
  }
}

// Also wrong: Promise.all() waits only until every task has started.
await Promise.all(items.map((item) => promisePool.run(() => process(item))));
```

Wait for completion in one of these ways:

- Await `run()` for every task, then call `await promisePool.promiseAllSettled()`.
- Collect the promises returned by `runAndWaitForReturnValue()` and wait for them with `Promise.allSettled()`.

`promiseAll()` and `Promise.all()` reject as soon as one task fails, while other tasks may still be running.
Use them only when the caller may continue before the remaining tasks finish.

## Usage

### Getting a task's return value

Use `runAndWaitForReturnValue()` when you need the task's result (or its error):

```ts
const promisePool = new PromisePool(5);

const results = await Promise.all(
  urls.map((url) => promisePool.runAndWaitForReturnValue(async () => (await fetch(url)).json()))
);
```

### Waiting for all running tasks

```ts
// Waits for all currently running tasks, but rejects as soon as one of them fails.
await promisePool.promiseAll();

// Waits for all currently running tasks and collects each outcome.
const outcomes = await promisePool.promiseAllSettled();
```

Both cover only the tasks running at the moment of the call.
Tasks still waiting for a slot and tasks that have already settled are not included.

### Adjusting concurrency at runtime

```ts
const promisePool = new PromisePool(10);
promisePool.concurrency = 2; // Running tasks continue; new tasks respect the new limit.
promisePool.concurrency = 20; // Queued tasks start immediately up to the new limit.
```

## API

### `new PromisePool<T>(concurrency = 10)`

Creates a pool that runs at most `concurrency` tasks concurrently.

### Methods

| Method                                   | Returns                              | Description                                                                                          |
| ---------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `run(startPromise)`                      | `Promise<void>`                      | Starts the task when the pool has capacity. Resolves once the task has **started**, not finished.    |
| `runAndWaitForReturnValue(startPromise)` | `Promise<R>`                         | Starts the task when the pool has capacity. Resolves with its return value, or rejects if it throws. |
| `promiseAll()`                           | `Promise<T[]>`                       | `Promise.all()` over the currently running tasks.                                                    |
| `promiseAllSettled()`                    | `Promise<PromiseSettledResult<T>[]>` | `Promise.allSettled()` over the currently running tasks.                                             |

### Properties

| Property              | Type     | Description                                                                         |
| --------------------- | -------- | ----------------------------------------------------------------------------------- |
| `concurrency`         | `number` | The maximum number of concurrent tasks. Writable; increasing it wakes queued tasks. |
| `workingPromiseCount` | `number` | The number of tasks that have started and not yet settled.                          |
| `queuedPromiseCount`  | `number` | The number of tasks submitted and not yet settled, including running ones.          |

### Error handling

`run()`'s returned promise rejects only when `startPromise` throws synchronously.
A rejection of the task itself is reported only through `promiseAll()` or `promiseAllSettled()` called while the task is still running.
Otherwise it becomes an unhandled promise rejection, which terminates Node.js by default.

When you need task outcomes reliably, use `runAndWaitForReturnValue()` and collect the returned promises yourself:

```ts
const outcomes = await Promise.allSettled(tasks.map((task) => promisePool.runAndWaitForReturnValue(task)));
```

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
