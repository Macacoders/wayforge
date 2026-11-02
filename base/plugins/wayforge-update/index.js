import { createNotifier } from "./core.js";

/**
 * OpenCode entrypoint: named `server` export receiving `{ client, ... }`.
 */
export function server(input) {
  const client = input?.client ?? null;
  const notifier = createNotifier({ client, env: process.env });
  return {
    event: async ({ event }) => {
      if (!event || event.type !== "session.created") return;
      await notifier.checkAndNotify();
    },
  };
}
