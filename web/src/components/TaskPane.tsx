import { useState } from "react";
import { EventType, type AgentEvent, type ClientMessage } from "@shared/events";
import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/ui/chat-container";
import { Markdown } from "@/components/ui/markdown";
import { Tool, type ToolPart } from "@/components/ui/tool";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from "@/components/ui/chain-of-thought";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";
import { Button } from "@/components/ui/button";
import { ThinkingDots } from "@/components/ui/thinking-dots";
import {
  ArrowUp,
  Circle,
  CircleCheck,
  CircleX,
  Eraser,
  Image as ImageIcon,
  Loader2,
  Network,
  ShieldAlert,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// The left pane is a PROJECTION of the harness event stream. It never talks to
// the model — it renders whatever events have arrived so far.
type SubagentState = "pending" | "started" | "completed" | "failed";
type Subagent = {
  stepId: string;
  agent: string;
  objective: string;
  state: SubagentState;
  findings: string;
};

type Turn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string }
  | { id: string; role: "tool"; part: ToolPart }
  | { id: string; role: "handoff"; from: string; to: string; reason: string }
  | { id: string; role: "supervision"; subagents: Subagent[] }
  | {
      id: string;
      role: "approval";
      workflowId: string;
      action: string;
      args: unknown;
      state: "pending" | "approved" | "rejected";
    }
  | { id: string; role: "log"; level: string; text: string };

function toTranscript(events: AgentEvent[]): { turns: Turn[]; running: boolean; activeWorkflowId: string | null } {
  const turns: Turn[] = [];
  let assistant: Extract<Turn, { role: "assistant" }> | null = null;
  let supervision: Extract<Turn, { role: "supervision" }> | null = null;
  const toolsById = new Map<string, Extract<Turn, { role: "tool" }>>();
  const approvalsById = new Map<string, Extract<Turn, { role: "approval" }>>();
  let open = 0;
  let activeWorkflowId: string | null = null;

  const sub = (stepId: string) => supervision?.subagents.find((s) => s.stepId === stepId);

  for (const ev of events) {
    switch (ev.type) {
      case EventType.WorkflowStarted:
        open++;
        activeWorkflowId = ev.workflowId;
        assistant = null;
        turns.push({ id: ev.id, role: "user", text: ev.input });
        break;
      case EventType.WorkflowCompleted:
      case EventType.WorkflowFailed:
        open = Math.max(0, open - 1);
        if (open === 0) activeWorkflowId = null;
        assistant = null;
        break;
      case EventType.ModelDelta:
        if (!assistant) {
          assistant = { id: ev.id, role: "assistant", text: "" };
          turns.push(assistant);
        }
        assistant.text += ev.text;
        break;
      case EventType.ModelCompleted:
        if (assistant) assistant.text = ev.text;
        else turns.push({ id: ev.id, role: "assistant", text: ev.text });
        assistant = null;
        break;
      case EventType.ToolRequested: {
        const turn: Extract<Turn, { role: "tool" }> = {
          id: ev.id,
          role: "tool",
          part: {
            type: ev.name,
            state: "input-available",
            input: ev.args as Record<string, unknown>,
            toolCallId: ev.toolCallId,
          },
        };
        toolsById.set(ev.toolCallId, turn);
        turns.push(turn);
        assistant = null;
        break;
      }
      case EventType.ToolCompleted: {
        const turn = toolsById.get(ev.toolCallId);
        if (turn) {
          turn.part = {
            ...turn.part,
            state: "output-available",
            output: ev.result as Record<string, unknown>,
          };
        }
        break;
      }
      case EventType.ToolFailed: {
        const turn = toolsById.get(ev.toolCallId);
        if (turn) turn.part = { ...turn.part, state: "output-error", errorText: ev.error };
        break;
      }
      case EventType.AgentHandoff:
        assistant = null;
        turns.push({ id: ev.id, role: "handoff", from: ev.from, to: ev.to, reason: ev.reason });
        break;
      case EventType.PlanCreated:
        assistant = null;
        supervision = {
          id: ev.id,
          role: "supervision",
          subagents: ev.steps.map((s) => ({
            stepId: s.id,
            agent: s.agent,
            objective: s.objective,
            state: "pending",
            findings: "",
          })),
        };
        turns.push(supervision);
        break;
      case EventType.SubagentStarted: {
        const s = sub(ev.stepId);
        if (s) s.state = "started";
        break;
      }
      case EventType.SubagentCompleted: {
        const s = sub(ev.stepId);
        if (s) {
          s.state = "completed";
          s.findings = ev.findings;
        }
        break;
      }
      case EventType.SubagentFailed: {
        const s = sub(ev.stepId);
        if (s) {
          s.state = "failed";
          s.findings = ev.error;
        }
        break;
      }
      case EventType.ApprovalRequested: {
        assistant = null;
        const turn: Extract<Turn, { role: "approval" }> = {
          id: ev.id,
          role: "approval",
          workflowId: ev.workflowId,
          action: ev.action,
          args: ev.args,
          state: "pending",
        };
        approvalsById.set(ev.toolCallId, turn);
        turns.push(turn);
        break;
      }
      case EventType.ApprovalResolved: {
        const turn = approvalsById.get(ev.toolCallId);
        if (turn) turn.state = ev.approved ? "approved" : "rejected";
        break;
      }
      case EventType.Log:
        turns.push({ id: ev.id, role: "log", level: ev.level, text: ev.message });
        break;
    }
  }

  return { turns, running: open > 0, activeWorkflowId };
}

export function TaskPane({
  events,
  send,
}: {
  events: AgentEvent[];
  send: (message: ClientMessage) => void;
}) {
  const [input, setInput] = useState("");
  const [supervised, setSupervised] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { turns, running, activeWorkflowId } = toTranscript(events);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        setSelectedImage(ev.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  }

  function submit() {
    let text = input.trim();
    if (selectedImage) {
      text = text
        ? `${text}\n\n[Attached Image Data for Visual Text Analysis: ${selectedImage.slice(0, 100)}... image_url: ${selectedImage}]`
        : `Please analyze this attached image, extract all text and visual data breakdown: ${selectedImage}`;
    }
    if (!text) return;
    send({ type: "submit_task", input: text, mode: supervised ? "supervised" : "default" });
    setInput("");
    setSelectedImage(null);
  }

  function stop() {
    send({ type: "stop_generation", workflowId: activeWorkflowId ?? undefined });
  }

  async function clearMemory() {
    // The route is wired up in the memory lesson; degrade gracefully before then.
    await fetch(`http://${location.hostname}:8787/api/clear`, { method: "POST" }).catch(() => {});
    location.reload(); // simplest reset: reconnect and replay the now-empty log
  }

  return (
    <section className="flex h-full min-h-0 flex-col border-r">

      <ChatContainerRoot className="min-h-0 flex-1">
        <ChatContainerContent className="space-y-5 px-4 py-5">
          {turns.length === 0 && (
            <p className="text-muted-foreground text-sm">Give the agent an objective to begin.</p>
          )}
          {turns.map((turn) => (
            <TurnView key={turn.id} turn={turn} />
          ))}
          {running && (
            <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-destructive/5 border border-destructive/20">
              <div className="flex items-center gap-2">
                <ThinkingDots size={10} gap={6} />
                <span className="text-xs text-muted-foreground font-medium animate-pulse">
                  Agent is generating output…
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={stop}
              >
                <Square className="size-3 fill-current" /> Stop
              </Button>
            </div>
          )}
        </ChatContainerContent>
      </ChatContainerRoot>

      <div className="border-t p-3 space-y-2">
        {selectedImage && (
          <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 p-2">
            <div className="relative group">
              <img
                src={selectedImage}
                alt="Image to analyze"
                className="size-12 rounded-md object-cover border"
              />
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow hover:scale-110 transition"
              >
                <X className="size-3" />
              </button>
            </div>
            <div className="text-xs">
              <p className="font-medium">Image attached</p>
              <p className="text-muted-foreground">Ready for image-to-text analysis</p>
            </div>
          </div>
        )}

        <PromptInput value={input} onValueChange={setInput} onSubmit={submit} isLoading={running}>
          <PromptInputTextarea
            className="dark:bg-transparent"
            placeholder="Give SIFRA an objective or attach an image to analyze…"
          />
          <PromptInputActions className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={supervised ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1.5 rounded-full text-xs"
                onClick={() => setSupervised((s) => !s)}
              >
                <Network className="size-3.5" /> Supervised
              </Button>

              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <Button
                  type="button"
                  variant={selectedImage ? "default" : "outline"}
                  size="sm"
                  className="h-8 gap-1.5 rounded-full text-xs"
                  onClick={(e) => {
                    const label = e.currentTarget.parentElement;
                    const inputEl = label?.querySelector("input");
                    inputEl?.click();
                  }}
                >
                  <ImageIcon className="size-3.5" /> {selectedImage ? "Image Added" : "Analyze Image"}
                </Button>
              </label>
            </div>

            {running ? (
              <PromptInputAction tooltip="Stop generation">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="h-8 gap-1.5 rounded-full px-3 text-xs font-medium shadow-sm transition-all hover:bg-destructive/90 animate-pulse hover:animate-none"
                  onClick={stop}
                >
                  <Square className="size-3.5 fill-current" />
                  Stop Generation
                </Button>
              </PromptInputAction>
            ) : (
              <div className="flex items-center gap-1.5">
                <PromptInputAction tooltip="Clear memory">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                    onClick={clearMemory}
                  >
                    <Eraser className="size-4" />
                  </Button>
                </PromptInputAction>
                <PromptInputAction tooltip="Run">
                  <Button
                    size="icon"
                    className="size-8 rounded-full"
                    onClick={submit}
                    disabled={!input.trim() && !selectedImage}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                </PromptInputAction>
              </div>
            )}
          </PromptInputActions>
        </PromptInput>
      </div>
    </section>
  );
}

const PROSE = "prose prose-sm dark:prose-invert max-w-none";

function ApprovalCard({ turn }: { turn: Extract<Turn, { role: "approval" }> }) {
  function decide(approved: boolean) {
    fetch(`http://${location.hostname}:8787/api/approve/${turn.workflowId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    }).catch(() => {});
  }

  const args = turn.args as Record<string, unknown> | null;
  const summary =
    turn.action === "issueRefund" && args
      ? `Refund $${((Number(args.amountCents) || 0) / 100).toFixed(2)} to ${String(args.customerId)} (charge ${String(args.chargeId)})`
      : JSON.stringify(turn.args);

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="size-4 text-amber-500" /> Approval required
        <span className="text-muted-foreground font-mono text-xs">{turn.action}</span>
      </div>
      <p className="text-muted-foreground mb-3 text-sm">{summary}</p>
      {turn.state === "pending" ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => decide(true)}>
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide(false)}>
            Reject
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "text-sm font-medium",
            turn.state === "approved" ? "text-emerald-600" : "text-destructive",
          )}
        >
          {turn.state === "approved" ? "✓ Approved" : "✗ Rejected"}
        </div>
      )}
    </div>
  );
}

function subagentIcon(state: SubagentState) {
  switch (state) {
    case "pending":
      return <Circle className="text-muted-foreground/40 size-4" />;
    case "started":
      return <Loader2 className="size-4 animate-spin text-sky-500" />;
    case "completed":
      return <CircleCheck className="size-4 text-emerald-500" />;
    case "failed":
      return <CircleX className="text-destructive size-4" />;
  }
}

const SUBAGENT_LABEL: Record<SubagentState, string> = {
  pending: "queued",
  started: "investigating…",
  completed: "done",
  failed: "failed",
};

function TurnView({ turn }: { turn: Turn }) {
  switch (turn.role) {
    case "user":
      return (
        <div className="flex justify-end">
          <div className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap">
            {turn.text}
          </div>
        </div>
      );
    case "assistant":
      return <Markdown className={PROSE}>{turn.text}</Markdown>;
    case "tool":
      return <Tool toolPart={turn.part} />;
    case "supervision":
      return (
        <div className="space-y-2">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <Network className="size-3.5" /> Supervisor · {turn.subagents.length} investigators
          </div>
          <ChainOfThought>
            {turn.subagents.map((s) => (
              <ChainOfThoughtStep key={s.stepId} defaultOpen>
                <ChainOfThoughtTrigger leftIcon={subagentIcon(s.state)}>
                  <span className="font-medium capitalize">{s.agent}</span>
                  <span className="text-muted-foreground"> · {SUBAGENT_LABEL[s.state]}</span>
                </ChainOfThoughtTrigger>
                <ChainOfThoughtContent>
                  <ChainOfThoughtItem className="italic">{s.objective}</ChainOfThoughtItem>
                  {s.state === "completed" && s.findings && (
                    <ChainOfThoughtItem className="text-foreground">
                      <Markdown className={PROSE}>{s.findings}</Markdown>
                    </ChainOfThoughtItem>
                  )}
                  {s.state === "failed" && (
                    <ChainOfThoughtItem className="text-destructive">{s.findings}</ChainOfThoughtItem>
                  )}
                </ChainOfThoughtContent>
              </ChainOfThoughtStep>
            ))}
          </ChainOfThought>
        </div>
      );
    case "approval":
      return <ApprovalCard turn={turn} />;
    case "handoff":
      return (
        <div className="text-muted-foreground flex items-center gap-2 py-1 text-xs">
          <div className="bg-border h-px flex-1" />
          <span className="shrink-0">
            ↪ handed off <span className="font-medium">{turn.from}</span> →{" "}
            <span className="text-foreground font-medium">{turn.to}</span>
          </span>
          <div className="bg-border h-px flex-1" />
        </div>
      );
    case "log":
      return (
        <p
          className={cn(
            "px-1 text-xs",
            turn.level === "error"
              ? "text-destructive"
              : turn.level === "warn"
                ? "text-amber-600"
                : "text-muted-foreground",
          )}
        >
          {turn.text}
        </p>
      );
  }
}
