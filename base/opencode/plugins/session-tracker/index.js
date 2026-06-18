import { tool } from "@opencode-ai/plugin/tool";

/**
 * In-memory session tracker.
 *
 * Each session keeps:
 *  - per-agent token totals (input, output, reasoning, cache read/write, cost)
 *  - per-tool invocation counts
 *  - per-command (shell) invocation counts
 */
const sessions = new Map();

/** Pending agent name per session, populated by `chat.params` hook. */
const pendingAgent = new Map();

/** Counters for diagnostics. */
let eventCount = 0;
let matchedCount = 0;

// Temporary: log first few token-bearing events to diagnose shape
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
let msgUpdatedCount = 0;
let partUpdatedCount = 0;
function diag(label, data) {
  try { fs.appendFileSync(path.join(os.tmpdir(), "token-tracker-diag.log"), `[${new Date().toISOString()}] ${label}: ${JSON.stringify(data)}\n`); } catch {}
}

function getSession(sessionID) {
  let session = sessions.get(sessionID);
  if (!session) {
    session = {
      agents: new Map(),
      tools: new Map(),
      commands: new Map(),
    };
    sessions.set(sessionID, session);
  }
  return session;
}

function getAgent(session, agent) {
  const key = agent || "unknown";
  let record = session.agents.get(key);
  if (!record) {
    record = {
      input: 0,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
    };
    session.agents.set(key, record);
  }
  return record;
}

function accumulateTokens(session, agent, tokens = {}, cost = 0) {
  const cache = tokens.cache || {};
  const record = getAgent(session, agent);
  record.input += tokens.input || 0;
  record.output += tokens.output || 0;
  record.reasoning += tokens.reasoning || 0;
  record.cacheRead += cache.read || 0;
  record.cacheWrite += cache.write || 0;
  record.cost += typeof cost === "number" ? cost : 0;
}

function agentTotal(record) {
  return (
    record.input +
    record.output +
    record.reasoning +
    record.cacheRead +
    record.cacheWrite
  );
}

function sessionTotal(session) {
  let total = 0;
  for (const record of session.agents.values()) {
    total += agentTotal(record);
  }
  return total;
}

function sessionCost(session) {
  let cost = 0;
  for (const record of session.agents.values()) {
    cost += record.cost;
  }
  return cost;
}

function sortByCountDescThenName(map) {
  return [...map.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}

function formatCurrency(value) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

function renderTable(headers, rows) {
  if (rows.length === 0) return "";

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length)),
  );

  const line = widths.map((w) => "-".repeat(w)).join(" | ");
  const head = headers.map((h, i) => h.padEnd(widths[i])).join(" | ");
  const body = rows.map((row) =>
    row.map((cell, i) => String(cell).padEnd(widths[i])).join(" | "),
  );

  return [head, line, ...body].join("\n");
}

function renderSummary(sessionID, session) {
  if (session.agents.size === 0) {
    return `## Session Token Summary\n\nNo token usage recorded for this session.\n\n_Events: ${eventCount} rcvd, ${matchedCount} matched | msg.updated: ${msgUpdatedCount}, part.updated: ${partUpdatedCount}_`;
  }

  const total = sessionTotal(session);
  const cost = sessionCost(session);

  const agentRows = [];
  for (const [name, record] of session.agents) {
    const agentTokens = agentTotal(record);
    const pct = total > 0 ? ((agentTokens / total) * 100).toFixed(1) : "0.0";
    const cache = record.cacheRead + record.cacheWrite;
    agentRows.push([
      name,
      record.input.toLocaleString(),
      record.output.toLocaleString(),
      record.reasoning.toLocaleString(),
      `${cache.toLocaleString()} (${record.cacheRead.toLocaleString()} read / ${record.cacheWrite.toLocaleString()} write)`,
      agentTokens.toLocaleString(),
      `${pct}%`,
    ]);
  }

  // Sort agents by token total descending, then by name.
  agentRows.sort((a, b) => {
    const totalA = parseInt(a[5].replace(/,/g, ""), 10);
    const totalB = parseInt(b[5].replace(/,/g, ""), 10);
    if (totalB !== totalA) return totalB - totalA;
    return a[0].localeCompare(b[0]);
  });

  const toolRows = sortByCountDescThenName(session.tools).map(([name, count]) => [
    name,
    count.toLocaleString(),
  ]);

  const commandRows = sortByCountDescThenName(session.commands).map(
    ([name, count]) => [name, count.toLocaleString()],
  );

  const parts = [
    "## Session Token Summary",
    "",
    `**Session ID:** ${sessionID}`,
    "",
    `**Total tokens:** ${total.toLocaleString()}`,
    "",
    "### Token breakdown by agent",
    "",
    renderTable(
      ["Agent", "Input", "Output", "Reasoning", "Cache", "Total", "%"],
      agentRows,
    ),
    "",
    `**Estimated cost:** $${formatCurrency(cost)}`,
    "",
    "### Tool invocations",
    "",
  ];

  if (toolRows.length > 0) {
    parts.push(renderTable(["Tool", "Invocations"], toolRows));
  } else {
    parts.push("No tool invocations recorded.");
  }

  parts.push("", "### Command invocations", "");

  if (commandRows.length > 0) {
    parts.push(renderTable(["Command", "Invocations"], commandRows));
  } else {
    parts.push("No command invocations recorded.");
  }

  parts.push("", `---`, `_Events: ${eventCount} rcvd, ${matchedCount} matched | msg.updated: ${msgUpdatedCount}, part.updated: ${partUpdatedCount}_`);

  return parts.join("\n");
}

export async function server(input) {
  return {
    tool: {
      token_summary: tool({
        description:
          "Return a structured token usage summary for the current session, including per-agent token totals, tool invocation counts, and command invocation counts.",
        args: tool.schema.object({}),
        async execute(args, ctx) {
          const sessionID = ctx.sessionID;
          const session = getSession(sessionID);
          return renderSummary(sessionID, session);
        },
      }),
    },
    // ── Hooks ───────────────────────────────────────────────────────
    event: async ({ event }) => {
      if (!event || !event.properties) return;
      const payload = event.properties;
      const { sessionID } = payload;
      if (!sessionID) return;

      eventCount++;
      const session = getSession(sessionID);

      switch (event.type) {
        // Capture agent from step-start events (may arrive as part updates)
        case "message.updated": {
          msgUpdatedCount++;
          if (msgUpdatedCount <= 3) {
            const info = payload.info;
            diag("message.updated", { agent: info?.agent, role: info?.role, hasTokens: !!info?.tokens, tokenKeys: info?.tokens ? Object.keys(info.tokens) : null });
          }
          const info = payload.info;
          if (info?.role === "assistant" && info.tokens) {
            matchedCount++;
            const agent = pendingAgent.get(sessionID) || info.agent || "unknown";
            accumulateTokens(session, agent, info.tokens, info.cost);
          }
          break;
        }
        case "message.part.updated": {
          partUpdatedCount++;
          if (partUpdatedCount <= 3) {
            const part = payload.part;
            diag("message.part.updated", { type: part?.type, hasTokens: !!part?.tokens, tokenKeys: part?.tokens ? Object.keys(part.tokens) : null });
          }
          const part = payload.part;
          // StepFinishPart has tokens and cost
          if (part?.type === "step-finish" && part.tokens) {
            matchedCount++;
            const agent = pendingAgent.get(sessionID) || "unknown";
            accumulateTokens(session, agent, part.tokens, part.cost);
          }
          break;
        }
      }
    },

    // Capture agent before each LLM call
    "chat.params": async (input, output) => {
      if (input.agent && input.sessionID) {
        pendingAgent.set(input.sessionID, input.agent);
      }
    },

    // Count tool invocations
    "tool.execute.after": async (input, output) => {
      if (input.sessionID && input.tool) {
        const session = getSession(input.sessionID);
        session.tools.set(input.tool, (session.tools.get(input.tool) || 0) + 1);
      }
    },

    // Count command invocations
    "command.execute.before": async (input, output) => {
      if (input.sessionID && input.command) {
        const session = getSession(input.sessionID);
        session.commands.set(input.command, (session.commands.get(input.command) || 0) + 1);
      }
    },
  };
}
