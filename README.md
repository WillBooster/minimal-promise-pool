# minimal-promise-pool

A minimal library for managing the maximum number of promise instances

## How to Use

The following example code runs only two promises at a maximum.

```ts
import { PromisePool, sleep } from 'minimal-promise-pool';

(async () => {
  const promisePool = new PromisePool(2);
  await promisePool.run(async () => {
    console.log('First task started');
    await sleep(10 * 1000);
    console.log('First task finished');
  });
  await promisePool.run(async () => {
    console.log('Second task started');
    await sleep(10 * 1000);
    console.log('Second task finished');
  });
  await promisePool.run(async () => {
    console.log('Third task started');
    await sleep(10 * 1000);
    console.log('Third task finished');
  });
})();
```

The result is as follows:

```
First task started
Second task started
# Wait for about 10 seconds
First task finished
Third task started
Second task finished
# Wait for about 10 seconds
Third task finished
```
