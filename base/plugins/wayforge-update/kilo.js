import { createNotifier } from "./core.js";

/**
 * Kilo Code entrypoint: default `{ id, server }` descriptor receiving a
 * context with `client`.
 */
function server(ctx) {
  const client = ctx?.client ?? null;
  const notifier = createNotifier({ client, env: process.env });
  return {
    event: async ({ event }) => {
      if (!event || event.type !== "session.created") return;
      await notifier.checkAndNotify();
    },
  };
}

export default { id: "wayforge-update", server };
