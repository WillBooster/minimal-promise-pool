# minimal-promise-pool

[![Test](https://github.com/WillBooster/minimal-promise-pool/actions/workflows/test.yml/badge.svg)](https://github.com/WillBooster/minimal-promise-pool/actions/workflows/test.yml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

A minimal library for managing the maximum number of promise instances.
For example, `new PromisePool(2)` limits the maximum number of concurrent executions to two.

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
