# SIFRA — Agent Orchestration & Multi-Agent Runtime

> A powerful multi-agent UI and orchestration harness for building durable LLM systems.

SIFRA is a robust application designed to provide the infrastructure layer around an LLM — the **harness**. It moves past basic API wrappers to offer a durable, isolated, memory-aware, and coordinated environment for running complex agent systems.

## Features

- **Advanced UI/UX:** A highly responsive, glassmorphism-inspired interface built with React and Tailwind CSS.
- **Dynamic Workspaces:** Features a collapsible sidebar, auto-renaming chats based on context, and real-time agent event streaming.
- **The Agent Harness:** Middleware that equips an LLM with context, tools, and necessary guardrails.
- **Durable Execution:** Checkpoint agent steps so that crashes or rate limits can resume exactly where they left off.
- **Secure Sandboxing:** Run untrusted, agent-generated code in an isolated runtime with proper timeouts.
- **Advanced Memory:** Hydrate the right context using state stores, sliding windows, and summarization.

## Setup

### 1. Clone and Install

```bash
git clone <this repo url>
cd SIFRA
npm install
```

### 2. Configure Environment Variables

Copy `.dev.vars.example` to `.dev.vars` and fill in your keys. An OpenAI API key is required, along with a Postgres database for durable execution. (You can grab a free instant Postgres database from [neon.new](https://neon.new) and use its **direct** connection string).

```text
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://user:password@host/db?sslmode=require
```

### 3. Run the Application

```bash
npm run dev    # Starts the harness server (:8787) and UI (:5173) concurrently
```

`npm run dev` boots the **SIFRA Workspace** — a chat pane on the left and a live event-stream pane on the right. You can interact with the agent, track its thinking process via custom animations, and view the execution stream alongside your conversation.

## Prerequisites

- Comfortable with TypeScript and Node.js.
- Basic understanding of LLM APIs and standard agent loops (receive → think → act → respond).
- Familiarity with asynchronous programming and API integrations.

## Tech Stack

- **Runtime:** Node.js + TypeScript, run with `tsx` (no build step for the server).
- **Server:** Express + `ws` — hosts the harness and streams its event log to the browser over one WebSocket.
- **Database:** Postgres via Drizzle ORM.
- **LLM:** OpenAI via the Vercel AI SDK.
- **UI:** Vite + React, styled with Tailwind CSS, Lucide Icons, and shadcn/ui components. Features custom micro-animations and a bespoke `ThinkingDots` indicator.

Everything runs locally for rapid development and testing.
