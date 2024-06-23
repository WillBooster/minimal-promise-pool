import { expect, test } from 'vitest';

import { PromisePool } from '../src/index.js';

test('run three heavy tasks', async () => {
  const env = new TestEnvironment(2);

  const [resolveFirst] = await env.runTask();
  const [resolveSecond] = await env.runTask();
  const promise = env.runTask();

  expect(env.startedCount).toBe(2);
  expect(env.finishedCount).toBe(0);

  resolveFirst();
  const [resolveThird] = await promise;

  expect(env.startedCount).toBe(3);
  expect(env.finishedCount).toBe(1);

  resolveSecond();

  expect(env.startedCount).toBe(3);
  expect(env.finishedCount).toBeLessThan(3);
  while (env.finishedCount < 2) {
    await sleep(1);
  }

  resolveThird();
  await env.promisePool.promiseAll();

  expect(env.startedCount).toBe(3);
  expect(env.finishedCount).toBe(3);
});

test('run one heavy and three light tasks', async () => {
  const env = new TestEnvironment(3);

  const [resolveLight1] = await env.runTask();
  const [resolveHeavy] = await env.runTask();
  const [resolveLight2] = await env.runTask();

  resolveLight1();
  resolveLight2();

  while (env.finishedCount < 2) {
    await sleep(1);
  }
  expect(env.startedCount).toBe(3);
  expect(env.finishedCount).toBe(2);

  const [resolveLight3] = await env.runTask();
  resolveLight3();

  while (env.finishedCount < 3) {
    await sleep(1);
  }
  expect(env.startedCount).toBe(4);
  expect(env.finishedCount).toBe(3);

  resolveHeavy();
  await env.promisePool.promiseAll();
  expect(env.startedCount).toBe(4);
  expect(env.finishedCount).toBe(4);
});

test('run 1000 light tasks', async () => {
  const env = new TestEnvironment(2);

  for (let i = 0; i < 1000; i++) {
    const [resolve] = await env.runTask();
    resolve();
  }
  await env.promisePool.promiseAll();
  expect(env.finishedCount).toBe(1000);
}, 10_000);

test('reduce concurrency during task', async () => {
  const env = new TestEnvironment(3);

  const [resolve1] = await env.runTask();
  const [resolve2] = await env.runTask();
  const [resolve3] = await env.runTask();

  expect(env.startedCount).toBe(3);
  expect(env.finishedCount).toBe(0);

  expect(env.promisePool.concurrency).toBe(3);
  env.promisePool.concurrency = 2;
  expect(env.promisePool.concurrency).toBe(2);

  resolve1();
  const promise = env.runTask();

  while (env.finishedCount < 1) {
    await sleep(1);
  }
  expect(env.startedCount).toBe(3);
  expect(env.finishedCount).toBe(1);

  resolve2();
  const [resolve4] = await promise;

  while (env.finishedCount < 2) {
    await sleep(1);
  }
  expect(env.startedCount).toBe(4);
  expect(env.finishedCount).toBe(2);

  resolve3();
  resolve4();

  await env.promisePool.promiseAll();
  expect(env.startedCount).toBe(4);
  expect(env.finishedCount).toBe(4);
});

test('increase concurrency during task', async () => {
  const env = new TestEnvironment(2);

  const [resolve1] = await env.runTask();
  const [resolve2] = await env.runTask();
  const promise = env.runTask();

  expect(env.startedCount).toBe(2);
  expect(env.finishedCount).toBe(0);

  expect(env.promisePool.concurrency).toBe(2);
  env.promisePool.concurrency = 3;
  expect(env.promisePool.concurrency).toBe(3);

  const [resolve3] = await promise;

  expect(env.startedCount).toBe(3);
  expect(env.finishedCount).toBe(0);

  resolve1();
  resolve2();
  resolve3();
  await env.promisePool.promiseAll();

  expect(env.startedCount).toBe(3);
  expect(env.finishedCount).toBe(3);
});

test('promiseAll() returns a rejected promise immediately after one of promises is rejected', async () => {
  const env = new TestEnvironment(2);

  const [resolveFirst] = await env.runTask();
  const [, rejectSecond] = await env.runTask();

  rejectSecond(new Error('error'));
  await expect(env.promisePool.promiseAll()).rejects.toThrow(Error);

  expect(env.startedCount).toBe(2);
  expect(env.finishedCount).toBe(0);

  resolveFirst(undefined);

  await env.promisePool.promiseAll();
  await env.promisePool.promiseAllSettled();
});

test('promiseAllSettled() returns an array after all the promises are settled', async () => {
  const env = new TestEnvironment(2);

  const [resolveFirst] = await env.runTask();
  const [, rejectSecond] = await env.runTask();

  const promise = env.promisePool.promiseAllSettled();
  resolveFirst(0);
  rejectSecond(new Error('error'));
  const results = await promise;

  expect(results).toHaveLength(2);
  expect(results[0].status === 'fulfilled' && results[0].value).toBe(0);
  expect(results[1].status === 'rejected' && results[1].reason).toBeInstanceOf(Error);

  expect(env.startedCount).toBe(2);

  await env.promisePool.promiseAll();
  await env.promisePool.promiseAllSettled();
});

test('promiseCount returns the number of working promises', async () => {
  const env = new TestEnvironment(2);

  expect(env.promisePool.workingPromiseCount).toBe(0);
  const [resolveFirst] = await env.runTask();
  expect(env.promisePool.workingPromiseCount).toBe(1);
  const [resolveSecond] = await env.runTask();
  expect(env.promisePool.workingPromiseCount).toBe(2);

  resolveFirst();
  while (env.finishedCount < 1) {
    await sleep(1);
  }
  expect(env.promisePool.workingPromiseCount).toBe(1);

  resolveSecond();
  await env.promisePool.promiseAllSettled();
  expect(env.promisePool.workingPromiseCount).toBe(0);
});

test('runAndWaitForReturnValue returns the resolved value of a promise', async () => {
  const promisePool = new PromisePool(2);
  const resolves: ((value: number) => void)[] = [];
  const promises = [
    new Promise((resolve) => resolves.push(resolve)),
    new Promise((resolve) => resolves.push(resolve)),
    new Promise((resolve) => resolves.push(resolve)),
  ];
  const promiseAll = Promise.all([
    promisePool.runAndWaitForReturnValue(() => promises[0]),
    promisePool.runAndWaitForReturnValue(() => promises[1]),
    promisePool.runAndWaitForReturnValue(() => promises[2]),
  ]);
  resolves[2](2);
  resolves[1](1);
  resolves[0](0);
  expect(await promiseAll).toEqual([0, 1, 2]);
});

type ResolveFunction = (value?: unknown) => void;
type RejectFunction = (reason?: unknown) => void;

class TestEnvironment {
  promisePool: PromisePool;
  startedCount: number;
  finishedCount: number;

  constructor(concurrency: number) {
    this.promisePool = new PromisePool(concurrency);
    this.startedCount = 0;
    this.finishedCount = 0;
  }

  async runTask(): Promise<[ResolveFunction, RejectFunction]> {
    let resolveFunction: ResolveFunction | undefined;
    let rejectFunction: RejectFunction | undefined;
    await this.promisePool.run(async () => {
      this.startedCount++;
      const promise = await new Promise((resolve, reject) => {
        resolveFunction = resolve;
        rejectFunction = reject;
      });
      this.finishedCount++;
      return promise;
    });
    return [resolveFunction as ResolveFunction, rejectFunction as RejectFunction];
  }
}

async function sleep(milliseconds: number): Promise<void> {
  return new Promise((r) => setTimeout(r, milliseconds));
}
