// MUST be first: loads .dev.vars before any module that reads env at load time.
import "./env";

import { DBOS } from "@dbos-inc/dbos-sdk";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { ensureSchema, clearEventLog } from "../sifra/db";
import { subscribe, history, stopWorkflow, activeWorkflows } from "../sifra/bus";
import { runAgentWorkflow } from "../sifra/runtime";
import { runSupervisorWorkflow } from "../sifra/supervisor";
import type { ClientMessage } from "@shared/events";

const PORT = Number(process.env.PORT ?? 8787);

async function main() {
  await ensureSchema();

  // Point DBOS at the same Postgres for its checkpoint store, then launch it.
  // launch() ALSO recovers any workflows that were mid-flight when the process
  // last died, resuming each from its last completed step.
  DBOS.setConfig({ name: "sifra", systemDatabaseUrl: process.env.DATABASE_URL });
  await DBOS.launch();

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); // inspector runs on a different port
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Clear the durable log. The inspector calls this, then reloads.
  app.post("/api/clear", async (_req, res) => {
    await clearEventLog();
    res.json({ ok: true });
  });

  // Stop active workflow task generation
  app.post("/api/stop", async (req, res) => {
    const workflowId = req.body?.workflowId as string | undefined;
    stopWorkflow(workflowId);
    if (workflowId) {
      await DBOS.cancelWorkflow(workflowId).catch(() => {});
    } else {
      for (const wId of activeWorkflows.keys()) {
        await DBOS.cancelWorkflow(wId).catch(() => {});
      }
    }
    res.json({ ok: true });
  });

  // Human-in-the-loop: deliver an approval decision to a suspended workflow.
  // DBOS.send wakes its recv() — even days later, even after a restart.
  app.post("/api/approve/:workflowId", async (req, res) => {
    const approved = Boolean(req.body?.approved);
    await DBOS.send(req.params.workflowId, { approved }, "approval");
    res.json({ ok: true });
  });

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  // Forward every emitted event to all connected inspectors.
  subscribe((event) => {
    const data = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(data);
    }
  });

  wss.on("connection", async (socket: WebSocket) => {
    // Register the message handler FIRST — history() is an async DB read, and the
    // client sends as soon as it connects.
    socket.on("message", async (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // An async handler that throws is an unhandled rejection, which kills the
      // Node process. Catch here so one bad message can't take the server down.
      try {
        if (message.type === "submit_task") {
          // Pick the runtime: the single-agent loop, or the supervisor.
          const workflow =
            message.mode === "supervised" ? runSupervisorWorkflow : runAgentWorkflow;
          await DBOS.startWorkflow(workflow)(message.input);
        } else if (message.type === "stop_generation") {
          stopWorkflow(message.workflowId);
          if (message.workflowId) {
            await DBOS.cancelWorkflow(message.workflowId).catch(() => {});
          } else {
            for (const wId of activeWorkflows.keys()) {
              await DBOS.cancelWorkflow(wId).catch(() => {});
            }
          }
        }
      } catch (error) {
        console.error("failed to handle message:", error);
      }
    });

    // Replay the durable timeline (including a workflow DBOS is recovering).
    // Same reason as above: a database error or a socket that closed mid-replay
    // must not crash the server.
    try {
      for (const event of await history()) {
        if (socket.readyState !== socket.OPEN) break;
        socket.send(JSON.stringify(event));
      }
    } catch (error) {
      console.error("failed to replay history:", error);
    }
  });

  server.listen(PORT, () => {
    console.log(`harness server listening on http://localhost:${PORT}  (ws: /ws)`);
  });
}

main().catch((error) => {
  console.error("failed to start:", error);
  process.exit(1);
});
