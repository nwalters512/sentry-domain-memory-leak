const express = require('express');
const asyncHandler = require('express-async-handler');
const Sentry = require('@sentry/node');
const Docker = require('dockerode');

Sentry.init();

const docker = new Docker();
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

app.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.bigData = new Array(100000)
      .fill(0)
      .map(() => makeRandomString(100));

    const container = await docker.createContainer({
      Image: 'ubuntu',
      Cmd: ['sleep', '100000'],
    });

    await container.start();

    container
      .wait()
      .then(() => {
        console.log('Container exited');
      })
      .catch((err) => {
        console.error('Container wait error', err);
      });

    res.send('Hello world!');
  })
);

app.listen(80);
