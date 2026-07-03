# minimal-promise-pool

[![Test](https://github.com/WillBooster/minimal-promise-pool/actions/workflows/test.yml/badge.svg)](https://github.com/WillBooster/minimal-promise-pool/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/minimal-promise-pool.svg)](https://www.npmjs.com/package/minimal-promise-pool)
[![license](https://img.shields.io/npm/l/minimal-promise-pool.svg)](https://github.com/WillBooster/minimal-promise-pool/blob/main/LICENSE)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

A minimal, zero-dependency promise pool for limiting the number of concurrently running promises.
For example, `new PromisePool(2)` runs at most two tasks at the same time and queues the rest.

## Features

- **Minimal** — a single class with no runtime dependencies.
- **Typed** — written in TypeScript with full type definitions.
- **Dual package** — ships both ESM and CommonJS builds.
- **FIFO scheduling** — queued tasks start in the order they were submitted.
- **Adjustable concurrency** — change the limit at runtime; the pool adapts immediately.

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
await promisePool.run(async () => {
  console.log('First task started');
  await sleep(10_000);
  console.log('First task finished');
});
await promisePool.run(async () => {
  console.log('Second task started');
  await sleep(10_000);
  console.log('Second task finished');
});
await promisePool.run(async () => {
  console.log('Third task started');
  await sleep(10_000);
  console.log('Third task finished');
});
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
```

Note that `run()` resolves when the task **starts**, not when it finishes.
`await promisePool.run(...)` therefore applies backpressure: it pauses the caller only while the pool is full.

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
// Waits for all currently running tasks; rejects if any of them fails.
await promisePool.promiseAll();

// Waits for all currently running tasks and collects each outcome.
const outcomes = await promisePool.promiseAllSettled();
```

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

| Method                                   | Returns                              | Description                                                                               |
| ---------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `run(startPromise)`                      | `Promise<void>`                      | Runs the task when the pool has capacity. Resolves once the task has started.             |
| `runAndWaitForReturnValue(startPromise)` | `Promise<R>`                         | Like `run()`, but resolves with the task's return value (and rejects if the task throws). |
| `promiseAll()`                           | `Promise<T[]>`                       | `Promise.all()` over the currently running tasks.                                         |
| `promiseAllSettled()`                    | `Promise<PromiseSettledResult<T>[]>` | `Promise.allSettled()` over the currently running tasks.                                  |

### Properties

| Property              | Type     | Description                                                                         |
| --------------------- | -------- | ----------------------------------------------------------------------------------- |
| `concurrency`         | `number` | The maximum number of concurrent tasks. Writable; increasing it wakes queued tasks. |
| `workingPromiseCount` | `number` | The number of currently running tasks.                                              |
| `queuedPromiseCount`  | `number` | The number of tasks that have been submitted but not yet finished.                  |

### Error handling

A rejection from a task passed to `run()` is not reported through `run()`'s returned promise (which only signals that the task started).
Use `runAndWaitForReturnValue()` to receive rejections directly, or `promiseAllSettled()` to collect them in bulk.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
