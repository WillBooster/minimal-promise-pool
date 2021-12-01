import { PromisePool, sleep } from '../src';

test('three heavy tasks', async () => {
  const promisePool = new PromisePool(2);
  let startedCount = 0;
  let finishedCount = 0;

  cancelled = false;
  setTimeout(() => {
    cancelled = true;
  }, 4000);

  await promisePool.run(async () => {
    startedCount++;
    const finished = await heavyTask();
    if (finished) finishedCount++;
  });
  await promisePool.run(async () => {
    startedCount++;
    const finished = await heavyTask();
    if (finished) finishedCount++;
  });
  await promisePool.run(async () => {
    startedCount++;
    const finished = await heavyTask();
    if (finished) finishedCount++;
  });

  expect(startedCount).toBe(3);
  expect(finishedCount).toBe(2);
});

test('one heavy and three light tasks', async () => {
  const promisePool = new PromisePool(3);
  let startedCount = 0;
  let finishedCount = 0;

  await promisePool.run(async () => {
    startedCount++;
    await sleep(100);
    finishedCount++;
  });
  await promisePool.run(async () => {
    startedCount++;
    await sleep(1000);
    finishedCount++;
  });
  await promisePool.run(async () => {
    startedCount++;
    await sleep(100);
    finishedCount++;
  });

  while (finishedCount < 2) {
    await sleep(1);
  }

  await promisePool.run(async () => {
    startedCount++;
    finishedCount++;
  });
  await promisePool.promiseAll();

  expect(startedCount).toBe(4);
  expect(finishedCount).toBe(4);
});

let cancelled = false;
async function heavyTask(): Promise<boolean> {
  for (let i = 0; i < 6; i++) {
    if (cancelled) return false;
    await sleep(500);
  }
  return true;
}
