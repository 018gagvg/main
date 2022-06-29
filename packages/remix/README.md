<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Remix

[![npm version](https://img.shields.io/npm/v/@sentry/nextjs.svg)](https://www.npmjs.com/package/@sentry/remix)
[![npm dm](https://img.shields.io/npm/dm/@sentry/nextjs.svg)](https://www.npmjs.com/package/@sentry/remix)
[![npm dt](https://img.shields.io/npm/dt/@sentry/nextjs.svg)](https://www.npmjs.com/package/@sentry/remix)
[![typedoc](https://img.shields.io/badge/docs-typedoc-blue.svg)](http://getsentry.github.io/sentry-javascript/)

This SDK is considering experimental and in an alpha state. It may experience breaking changes. Please reach out on [GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have any feedback/concerns.
## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/react` for the client, with added functionality related to Next.js.

To use this SDK, init Sentry in your remix entry points for both the client and server.

```javascript
// entry.client.tsx

import { useLocation, useMatches } from "@remix-run/react";
import * as Sentry from "@sentry/remix";
import { useEffect } from "react";

Sentry.init({
  dsn: "__DSN__",
  tracesSampleRate: 1,
  integrations: [
    new Sentry.BrowserTracing({
        routingInstrumentation: Sentry.remixRouterInstrumentation(
            useEffect,
            useLocation,
            useMatches,
        ),
    }),
  ],
  // ...
});
```

```javascript
// entry.server.tsx

import { prisma } from "~/db.server";

import * as Sentry from "@sentry/remix";

Sentry.init({
  dsn: "__DSN__",
  tracesSampleRate: 1,
  integrations: [new Sentry.Integrations.Prisma({ client: prisma })],
  // ...
});
```

To set context information or send manual events, use the exported functions of `@sentry/remix`.

```javascript
import * as Sentry from '@sentry/remix';

// Set user information, as well as tags and further extras
Sentry.configureScope(scope => {
  scope.setExtra('battery', 0.7);
  scope.setTag('user_mode', 'admin');
  scope.setUser({ id: '4711' });
  // scope.clear();
});

// Add a breadcrumb for future events
Sentry.addBreadcrumb({
  message: 'My Breadcrumb',
  // ...
});

// Capture exceptions, messages or manual events
Sentry.captureMessage('Hello, world!');
Sentry.captureException(new Error('Good bye'));
Sentry.captureEvent({
  message: 'Manual',
  stacktrace: [
    // ...
  ],
});
```

## Sourcemaps and Releases

The Remix SDK provides a script that automatically creates a release and uploads sourcemaps.

On release, call `sentry-upload-sourcemaps` to upload source maps and create a release. To see more details on how to use the command, call `sentry-upload-sourcemaps --help`.

For more advanced configuration, [directly use `sentry-cli` to upload source maps.](https://github.com/getsentry/sentry-cli).
