import { PromisePool, sleep } from '../src';

test('PromisePool', async () => {
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

let cancelled = false;
async function heavyTask(): Promise<boolean> {
  for (let i = 0; i < 6; i++) {
    if (cancelled) return false;
    await sleep(500);
  }
  return true;
}
