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
      await container.remove();
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

    const container = await pool.acquire();
    console.log('container acquired');

    if (reuseContainer) {
      requestCount += 1;
      await pool.release(container);
    } else {
      requestCount = 0;
      await pool.destroy(container);
    }

    res.send(reuseContainer ? 'Reused' : 'New');
  })
);

pool.ready().then(() => {
  app.listen(80);
  console.log('server started');
});
