# sentry-domain-memory-leak

This repo contains a reproduction of an issue related to https://github.com/getsentry/sentry-javascript/issues/7031.

## Reproduction instructions

- Clone the repo and run `yarn install`
- Run `docker pull ubuntu`
- Run `node --inspect index.js`
- Attach a debugger and look at the memory consumption; it should be ~10MB.
- Make a request to `http://localhost:80/` in your browser.
- Look at the memory consumption in the debugger; it should be about 300MB and should stay that way even after manually triggering a garbage collection.
- Stop the server, remove all Sentry-related code from `index.js`, and repeat the above steps. Note that memory consumption should fall back to ~10MB either immediately or after triggering a garbage collection.
