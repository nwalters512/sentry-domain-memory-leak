const express = require('express');
const asyncHandler = require('express-async-handler');
const Sentry = require('@sentry/node');
const Docker = require('dockerode');
const genericPool = require('generic-pool');

const docker = new Docker();

const pool = genericPool.createPool(
  {
    create: async () => {
      const container = await docker.createContainer({
        Image: 'ubuntu',
        Cmd: ['sleep', '100000'],
        HostConfig: {
          AutoRemove: true,
        },
      });

      await container.start();

      console.log('container started');

      container
        .wait()
        .then(() => {
          console.log('Container exited');
        })
        .catch((err) => {
          console.error('Container wait error', err);
        });

      return container;
    },
    destroy: async (container) => {
      await container.stop();
    },
  },
  {
    min: 2,
    max: 2,
  }
);

pool.on('factoryCreateError', (err) => {
  console.error('Error creating container', err);
});

pool.on('factoryDestroyError', (err) => {
  console.error('Error destroying container', err);
});

/** @type {Set<CodeCaller>} */
let unhealthyCodeCallers = new Set();

async function getHealthyCodeCaller() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const codeCaller = await pool.acquire();
    if (!unhealthyCodeCallers.has(codeCaller)) {
      return codeCaller;
    }
    await pool.release(codeCaller);
    await sleep(0);
  }
}

function destroyUnhealthyCodeCallers() {
  unhealthyCodeCallers.forEach((codeCaller) => {
    // Delete from the set first. That way, if `pool.destroy()` is still running
    // on the next tick of this `destroyUnhealthyCodeCallers()` function, we
    // won't try to destroy it again.
    unhealthyCodeCallers.delete(codeCaller);
    console.log('destroying unhealthy container', codeCaller);
    pool.destroy(codeCaller).catch((err) => {
      logger.error('Error destroying unhealthy container', err);
      Sentry.captureException(err);
    });
  });

  setTimeout(destroyUnhealthyCodeCallers, 100);
}

destroyUnhealthyCodeCallers();

Sentry.init();

const app = express();

app.use(Sentry.Handlers.requestHandler());

function makeRandomString(length) {
  let result = '';
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}

let requestCount = 0;

app.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.bigData = new Array(100000)
      .fill(0)
      .map(() => makeRandomString(100));

    let reuseContainer = requestCount < 5;

    const container = await getHealthyCodeCaller();
    console.log('container acquired');

    if (reuseContainer) {
      requestCount += 1;
      await pool.release(container);
    } else {
      requestCount = 0;
      unhealthyCodeCallers.add(container);
    }

    res.send(reuseContainer ? 'Reused' : 'New');
  })
);

pool.ready().then(() => {
  app.listen(80);
  console.log('server started');
});
