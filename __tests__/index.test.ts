import { beforeEach, expect, test } from 'vitest';

import { PromisePool, sleep } from '../src';

class TestEnvironment {
  promisePool: PromisePool;
  startedCount: number;
  finishedCount: number;

  constructor(concurrency: number) {
    this.promisePool = new PromisePool(concurrency);
    this.startedCount = 0;
    this.finishedCount = 0;
  }
}

test('run three heavy tasks', async () => {
  const env = new TestEnvironment(2);

  const [resolveFirst] = await runTask(env);
  const [resolveSecond] = await runTask(env);
  const promise = runTask(env);

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

  const [resolveLight1] = await runTask(env);
  const [resolveHeavy] = await runTask(env);
  const [resolveLight2] = await runTask(env);

  resolveLight1();
  resolveLight2();

  while (env.finishedCount < 2) {
    await sleep(1);
  }
  expect(env.startedCount).toBe(3);
  expect(env.finishedCount).toBe(2);

  const [resolveLight3] = await runTask(env);
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
    const [resolve] = await runTask(env);
    resolve();
  }
  await env.promisePool.promiseAll();
  expect(env.finishedCount).toBe(1000);
}, 10_000);

test('reduce concurrency during task', async () => {
  const env = new TestEnvironment(3);

  const [resolve1] = await runTask(env);
  const [resolve2] = await runTask(env);
  const [resolve3] = await runTask(env);

  expect(env.startedCount).toBe(3);
  expect(env.finishedCount).toBe(0);

  expect(env.promisePool.concurrency).toBe(3);
  env.promisePool.concurrency = 2;
  expect(env.promisePool.concurrency).toBe(2);

  resolve1();
  const promise = runTask(env);

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

  const [resolve1] = await runTask(env);
  const [resolve2] = await runTask(env);
  const promise = runTask(env);

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

  const [resolveFirst] = await runTask(env);
  const [, rejectSecond] = await runTask(env);

  rejectSecond(new Error('error'));
  await expect(env.promisePool.promiseAll()).rejects.toThrow(Error);

  expect(env.startedCount).toBe(2);
  expect(env.finishedCount).toBe(0);

  resolveFirst(undefined);
});

test('promiseAllSettled() returns an array after all the promises are settled', async () => {
  const env = new TestEnvironment(2);

  const [resolveFirst] = await runTask(env);
  const [, rejectSecond] = await runTask(env);

  const promise = env.promisePool.promiseAllSettled();
  resolveFirst(0);
  rejectSecond(new Error('error'));
  const results = await promise;

  expect(results).toHaveLength(2);
  expect(results[0].status === 'fulfilled' && results[0].value).toBe(0);
  expect(results[1].status === 'rejected' && results[1].reason).toBeInstanceOf(Error);

  expect(env.startedCount).toBe(2);
});

type ResolveFunction = (value?: any) => void;
type RejectFunction = (reason?: any) => void;

async function runTask(env: TestEnvironment): Promise<[ResolveFunction, RejectFunction]> {
  let resolveFunction: ResolveFunction | undefined;
  let rejectFunction: RejectFunction | undefined;
  await env.promisePool.run(async () => {
    env.startedCount++;
    const ret = await new Promise((resolve, reject) => {
      resolveFunction = resolve;
      rejectFunction = reject;
    });
    env.finishedCount++;
    return ret;
  });
  return [resolveFunction as ResolveFunction, rejectFunction as RejectFunction];
}
