import { PromisePool, sleep } from '../src';

type ResolveFunction = (value: unknown) => void;
type RejectFunction = (reason?: any) => void;

test('run three heavy tasks', async () => {
  const promisePool = new PromisePool(2);
  let startedCount = 0;
  let finishedCount = 0;

  for (let i = 0; i < 2; i++) {
    await promisePool.run(async () => {
      expect([0, 1]).toEqual(expect.arrayContaining([startedCount]));
      expect(finishedCount).toBe(0);

      startedCount++;
      await sleep(1000);
      finishedCount++;

      expect([2, 3]).toEqual(expect.arrayContaining([startedCount]));
      expect([1, 2]).toEqual(expect.arrayContaining([finishedCount]));
    });
  }
  await promisePool.run(async () => {
    expect(startedCount).toBe(2);
    expect([1, 2]).toEqual(expect.arrayContaining([finishedCount]));

    startedCount++;
    await sleep(1000);
    finishedCount++;

    expect(startedCount).toBe(3);
    expect(finishedCount).toBe(3);
  });

  await promisePool.promiseAll();
  expect(startedCount).toBe(3);
  expect(finishedCount).toBe(3);
});

test('run one heavy and three light tasks', async () => {
  const promisePool = new PromisePool(3);
  let startedCount = 0;
  let finishedCount = 0;

  // light task 1
  await promisePool.run(async () => {
    startedCount++;
    await sleep(100);
    finishedCount++;
  });
  // heavy task 1
  await promisePool.run(async () => {
    startedCount++;
    await sleep(1000);
    finishedCount++;
  });
  // light task 2
  await promisePool.run(async () => {
    startedCount++;
    await sleep(100);
    finishedCount++;
  });

  while (finishedCount < 2) {
    await sleep(1);
  }
  expect(startedCount).toBe(3);
  expect(finishedCount).toBe(2);

  // light task 3
  await promisePool.run(async () => {
    startedCount++;
    finishedCount++;
  });

  await promisePool.promiseAll();
  expect(startedCount).toBe(4);
  expect(finishedCount).toBe(4);
});

test('run 1000 light tasks', async () => {
  const promisePool = new PromisePool(2);
  let count = 0;
  for (let i = 0; i < 1000; i++) {
    await promisePool.run(async () => {
      await sleep(0);
      count++;
    });
  }
  await promisePool.promiseAll();
  expect(count).toBe(1000);
}, 10_000);

test('reduce concurrency during task', async () => {
  const promisePool = new PromisePool(3);
  let startedCount = 0;
  let finishedCount = 0;

  for (let i = 1; i <= 3; i++) {
    await promisePool.run(async () => {
      startedCount++;
      await sleep(1000 * i);
      finishedCount++;
    });
  }
  expect(startedCount).toBe(3);
  expect(finishedCount).toBe(0);

  expect(promisePool.concurrency).toBe(3);
  promisePool.concurrency = 2;
  expect(promisePool.concurrency).toBe(2);
  await promisePool.run(async () => {
    expect(finishedCount).toBe(2);
    startedCount++;
    await sleep(0);
    finishedCount++;
  });
  await promisePool.promiseAll();
  expect(startedCount).toBe(4);
  expect(finishedCount).toBe(4);
});

test('increase concurrency during task', async () => {
  const promisePool = new PromisePool(2);
  let startedCount = 0;
  let finishedCount = 0;

  for (let i = 1; i <= 2; i++) {
    await promisePool.run(async () => {
      startedCount++;
      await sleep(1000 * i);
      finishedCount++;
    });
  }
  expect(startedCount).toBe(2);
  expect(finishedCount).toBe(0);

  expect(promisePool.concurrency).toBe(2);
  promisePool.concurrency = 3;
  expect(promisePool.concurrency).toBe(3);
  await promisePool.run(async () => {
    expect(finishedCount).toBe(0);
    startedCount++;
    await sleep(0);
    finishedCount++;
  });
  await promisePool.promiseAll();
  expect(startedCount).toBe(3);
  expect(finishedCount).toBe(3);
});

test('promiseAll() return a rejected promise immediately after one of promises is rejected', async () => {
  const promisePool = new PromisePool(2);
  let startedCount = 0;
  let finishedCount = 0;

  let resolveFirst: ResolveFunction | undefined;
  let rejectSecond: RejectFunction | undefined;

  await promisePool.run(async () => {
    startedCount++;
    await new Promise((resolve, reject) => {
      resolveFirst = resolve;
    });
    finishedCount++;
  });
  await promisePool.run(async () => {
    startedCount++;
    await new Promise((resolve, reject) => {
      rejectSecond = reject;
    });
    finishedCount++;
  });

  rejectSecond?.(new Error('error'));
  await expect(promisePool.promiseAll()).rejects.toThrow(Error);

  expect(startedCount).toBe(2);
  expect(finishedCount).toBe(0);

  resolveFirst?.(undefined);
});

test('promiseAllSettled() return an array after all the promises is settled', async () => {
  const promisePool = new PromisePool(2);
  let startedCount = 0;

  await promisePool.run(async () => {
    startedCount++;
    await sleep(1000);
    return 0;
  });
  await promisePool.run(async () => {
    startedCount++;
    await sleep(500);
    throw new Error('error');
  });

  const results = await promisePool.promiseAllSettled();
  expect(results).toHaveLength(2);
  expect(results[0].status === 'fulfilled' && results[0].value).toBe(0);
  expect(results[1].status === 'rejected' && results[1].reason).toBeInstanceOf(Error);

  expect(startedCount).toBe(2);
});

// function createHeavyPromise(): [Promise<unknown>, ResolveFunction, RejectFunction] {
//   let resolveFunction: ((value: unknown) => void) | undefined;
//   let rejectFunction: ((reason?: any) => void) | undefined;
//   const promise = new Promise((resolve, reject) => {
//     resolveFunction = resolve;
//     rejectFunction = reject;
//   });
//   return [promise, resolveFunction, rejectFunction];
// }
