<div align="center">
  <img src="./web/public/logo.jpg" alt="SIFRA Logo" width="150" />
</div>

# SIFRA — Agent Orchestration & Multi-Agent Runtime

> A powerful multi-agent UI and orchestration harness for building durable LLM systems.

SIFRA is a robust application designed to provide the infrastructure layer around an LLM — the **harness**. It moves past basic API wrappers to offer a durable, isolated, memory-aware, and coordinated environment for running complex agent systems.

## Architecture

```mermaid
graph TD
    User([User]) -->|Interacts| UI[Frontend UI<br/>React + Vite]
    UI <-->|WebSocket<br/>Events & Commands| Server[Backend Server<br/>Express + Node.js]
    Server <-->|API Calls| LLM[LLM Engine<br/>OpenAI / Vercel AI SDK]
    Server <-->|State Checkpoints| DB[(Postgres DB<br/>Durable Execution)]
```

## Features

- **The Agent Harness:** Acts as intelligent middleware that equips the LLM with context, custom tools, and strict guardrails to keep execution on track.
- **Durable Execution:** Automatically saves state checkpoints to a Postgres database, allowing agents to resume exactly where they left off in the event of crashes or API rate limits.
- **Real-Time Dual-Pane UI:** A modern, highly responsive React/Tailwind interface featuring a chat pane for interaction and a live WebSocket-powered event-stream pane for complete observability into the AI's "thought" process.
- **Advanced Memory Hydration:** Intelligently manages context limits using state stores, sliding windows, and automatic summarization to keep the LLM focused and reduce API costs.
- **Secure Code Sandboxing:** Runs untrusted, AI-generated code in a strictly isolated runtime with resource constraints and timeouts to prevent system vulnerabilities.
- **Dynamic Workspaces:** Features a collapsible sidebar, context-aware auto-renaming for chat sessions, and custom micro-animations for a premium user experience.

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

## Usage Guide

Once SIFRA is running locally, open `http://localhost:5173` in your browser.

- **Starting a Chat**: Type an objective in the input bar and press the send icon (or `Enter`). SIFRA will automatically rename the chat tab in the sidebar based on your first prompt.
- **Managing Workspaces**: Use the SIFRA logo in the top-left to expand or collapse the sidebar. The sidebar tracks your recent chats, allowing you to seamlessly switch context.
- **Renaming Chats**: Double-click any chat name in the expanded sidebar, or click the pencil icon on hover, to manually rename a session.
- **Monitoring Execution**: The dual-pane system shows your conversation on the left and the raw event stream on the right. Watch the harness emit internal events in real-time.
- **Theme Toggle**: Use the moon/sun icon in the top-right header to switch between light and dark modes.
- **Clear Memory**: Click the eraser icon next to the send button to quickly clear the current agent's context and restart the session.

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
