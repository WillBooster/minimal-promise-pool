import { PromisePool, sleep } from '../src';

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
