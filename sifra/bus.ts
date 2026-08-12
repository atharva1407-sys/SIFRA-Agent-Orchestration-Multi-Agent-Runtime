import { randomUUID } from "node:crypto";
import { db, eventLog } from "./db";
import type { AgentEvent, EventInput } from "@shared/events";

// The harness event bus. Two jobs now:
//   1. DURABLY persist every event to Postgres (so the timeline survives a crash)
//   2. broadcast it live to any connected inspector
//
// `emit` is async now — we write to the database before we hand the event out.

type Listener = (event: AgentEvent) => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function emit(input: EventInput): Promise<void> {
  const event: AgentEvent = { ...input, id: randomUUID(), ts: Date.now() };
  await db.insert(eventLog).values({ data: event }); // durable, ordered by `seq`
  for (const listener of listeners) listener(event); // live
}

// The full timeline so far, in order — read back from Postgres on every connect.
export async function history(): Promise<AgentEvent[]> {
  const rows = await db.select().from(eventLog).orderBy(eventLog.seq);
  return rows.map((row) => row.data);
}

// Active workflow tracking for instant cancellation & AbortController management
export const activeWorkflows = new Map<string, AbortController>();

export function registerActiveWorkflow(workflowId: string): AbortController {
  const controller = new AbortController();
  activeWorkflows.set(workflowId, controller);
  return controller;
}

export function unregisterActiveWorkflow(workflowId: string): void {
  activeWorkflows.delete(workflowId);
}

export function stopWorkflow(workflowId?: string): void {
  if (workflowId) {
    const controller = activeWorkflows.get(workflowId);
    if (controller) {
      controller.abort();
      activeWorkflows.delete(workflowId);
    }
  } else {
    for (const controller of activeWorkflows.values()) {
      controller.abort();
    }
    activeWorkflows.clear();
  }
}

