import { useState } from "react";
import type { AgentEvent } from "@shared/events";
import { cn } from "@/lib/utils";
import { Activity, ChevronRight } from "lucide-react";

// Color-coded badge styles per event group
const badgeStyle: Record<string, string> = {
  workflow: "bg-violet-500/15 text-violet-600 dark:bg-violet-400/15 dark:text-violet-400",
  model: "bg-sky-500/15 text-sky-600 dark:bg-sky-400/15 dark:text-sky-400",
  tool: "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400",
  memory: "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400",
  agent: "bg-pink-500/15 text-pink-600 dark:bg-pink-400/15 dark:text-pink-400",
  plan: "bg-indigo-500/15 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400",
  subagent: "bg-cyan-500/15 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-400",
  approval: "bg-orange-500/15 text-orange-600 dark:bg-orange-400/15 dark:text-orange-400",
  log: "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400",
};

// Status dot color per event suffix
function statusDot(type: string): string {
  if (type.endsWith(".started")) return "bg-sky-400";
  if (type.endsWith(".completed")) return "bg-emerald-400";
  if (type.endsWith(".failed")) return "bg-red-400";
  if (type.endsWith(".requested")) return "bg-amber-400";
  if (type.endsWith(".delta")) return "bg-sky-300 animate-pulse";
  return "bg-muted-foreground/40";
}

function CollapsiblePayload({ data }: { data: string }) {
  const [open, setOpen] = useState(false);
  const short = data.length > 80 ? data.slice(0, 80) + "…" : data;

  if (data.length <= 80) {
    return <span className="text-muted-foreground/70 break-all">{data}</span>;
  }

  return (
    <span className="text-muted-foreground/70">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-transform duration-200",
            open && "rotate-90",
          )}
        />
        {open ? null : <span className="break-all">{short}</span>}
      </button>
      {open && (
        <span className="mt-1 block break-all rounded bg-muted/50 p-1.5 text-[0.65rem] leading-relaxed">
          {data}
        </span>
      )}
    </span>
  );
}

export function InspectorPane({ events }: { events: AgentEvent[] }) {
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Event Stream</h2>
        </div>
        <span className="text-muted-foreground rounded-full bg-muted/60 px-2 py-0.5 text-[0.65rem] font-medium tabular-nums">
          {events.length} events
        </span>
      </div>
      <ol className="inspector-scroll min-h-0 flex-1 overflow-auto p-2 font-mono text-xs">
        {events.length === 0 && (
          <li className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="relative">
              <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 via-sky-500/10 to-emerald-500/10 p-6">
                <Activity className="size-10 text-muted-foreground/40 animate-float" />
              </div>
              <div className="absolute -top-1 -right-1 size-3 rounded-full bg-emerald-400 animate-pulse-dot" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Listening for events</p>
              <p className="text-xs text-muted-foreground/60">
                Submit a task to see the harness event stream flow here in real time.
              </p>
            </div>
          </li>
        )}
        {events.map((ev, i) => {
          const group = ev.type.split(".")[0];
          return (
            <li
              key={ev.id}
              className="event-row animate-fade-slide-in flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
              style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
            >
              <span className="flex items-center gap-1.5 shrink-0 pt-0.5">
                <span className={cn("size-1.5 rounded-full shrink-0", statusDot(ev.type))} />
                <span className="text-muted-foreground/50 tabular-nums text-[0.65rem] w-[4.5rem]">
                  {formatTime(ev.ts)}
                </span>
              </span>
              <span className={cn("event-badge shrink-0", badgeStyle[group] ?? "bg-muted text-muted-foreground")}>
                {ev.type}
              </span>
              <CollapsiblePayload data={summarize(ev)} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

function summarize(ev: AgentEvent): string {
  const payload: Record<string, unknown> = { ...ev };
  delete payload.id;
  delete payload.ts;
  delete payload.type;
  delete payload.workflowId;
  return JSON.stringify(payload);
}
