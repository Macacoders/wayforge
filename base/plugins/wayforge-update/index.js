import { createNotifier } from "./core.js";

/**
 * OpenCode entrypoint: named `server` export receiving `{ client, ... }`.
 */
export function server(input) {
  const client = input?.client ?? null;
  const notifier = createNotifier({ client, env: process.env });
  return {
    event: ({ event }) => {
      if (!event || event.type !== "session.created") return;
      // Fire-and-forget: session creation must never wait on the network.
      // checkAndNotify swallows its own errors, so the promise is safe to
      // leave unobserved.
      void notifier.checkAndNotify();
    },
  };
}
