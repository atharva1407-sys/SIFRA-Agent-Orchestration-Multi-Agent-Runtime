import { useState, useCallback, useRef, useEffect } from "react";
import { Moon, Sun, Plus, X, MessageSquare, User, Pencil } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHarnessSocket } from "./useHarnessSocket";
import { useTheme } from "./useTheme";
import { TaskPane } from "./components/TaskPane";
import { InspectorPane } from "./components/InspectorPane";
import type { AgentEvent, ClientMessage } from "@shared/events";
import { EventType } from "@shared/events";

// ── Tab types ───────────────────────────────────────────────────────

type Tab = {
  id: string;
  name: string;
  workflowIds: Set<string>;
};

let tabCounter = 1;
function createTab(): Tab {
  return {
    id: `tab-${Date.now()}-${tabCounter}`,
    name: `Chat ${tabCounter++}`,
    workflowIds: new Set(),
  };
}

// ── App ─────────────────────────────────────────────────────────────

export function App() {
  const { events, connected, send } = useHarnessSocket();
  const { theme, toggle } = useTheme();

  // Tab state
  const [tabs, setTabs] = useState<Tab[]>(() => [createTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);

  // Sidebar & Profile state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  function renameTab(tabId: string, newName: string) {
    if (!newName.trim()) return;
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, name: newName.trim() } : t)));
  }

  // Track which tab is awaiting a workflow assignment
  const pendingTabRef = useRef<string | null>(null);

  // When a workflow.started event arrives, assign it to the pending tab
  const prevEventCountRef = useRef(0);
  useEffect(() => {
    if (events.length <= prevEventCountRef.current) return;
    const newEvents = events.slice(prevEventCountRef.current);
    prevEventCountRef.current = events.length;

    for (const ev of newEvents) {
      if (ev.type === EventType.WorkflowStarted && pendingTabRef.current) {
        const tabId = pendingTabRef.current;
        pendingTabRef.current = null;
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? { ...t, workflowIds: new Set([...t.workflowIds, ev.workflowId]) }
              : t,
          ),
        );
      }
    }
  }, [events]);

  // Wrapped send that marks the active tab as pending
  const tabSend = useCallback(
    (message: ClientMessage) => {
      if (message.type === "submit_task") {
        pendingTabRef.current = activeTabId;
        
        // Auto-name chat based on first prompt
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id === activeTabId && t.name.startsWith("Chat ")) {
              const input = (message as any).input || "";
              let newName = input.trim().split("\n")[0];
              if (newName.length > 22) {
                newName = newName.slice(0, 22) + "...";
              }
              return { ...t, name: newName || t.name };
            }
            return t;
          })
        );
      }
      send(message);
    },
    [send, activeTabId],
  );

  // Tab actions
  function addTab() {
    const newTab = createTab();
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }

  function closeTab(tabId: string) {
    setTabs((prev) => {
      if (prev.length <= 1) return prev; // keep at least 1
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(next[next.length - 1].id);
      }
      return next;
    });
  }

  // Filter events for the active tab
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const tabEvents: AgentEvent[] =
    activeTab.workflowIds.size === 0
      ? [] // empty tab — no events yet
      : events.filter((ev) => {
          const wId = (ev as { workflowId?: string }).workflowId;
          return wId ? activeTab.workflowIds.has(wId) : false;
        });

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full">
        {/* ── Vertical Tab Sidebar ── */}
        <nav className={cn("tab-sidebar", isSidebarOpen && "expanded")}>
          {/* Logo Toggle */}
          <div className="sidebar-logo-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <img src="/logo.jpg" alt="SIFRA Logo" />
            <span className="sidebar-logo-text">SIFRA</span>
          </div>

          <div className="sidebar-section-title">Recent chats</div>

          {tabs.map((tab, i) => (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "tab-item group",
                    tab.id === activeTabId && "tab-item-active",
                  )}
                  onClick={() => setActiveTabId(tab.id)}
                  onDoubleClick={() => {
                    setIsSidebarOpen(true);
                    setEditingTabId(tab.id);
                  }}
                  title="Double click to rename"
                >
                  <MessageSquare className="size-4 shrink-0" />
                  
                  {editingTabId === tab.id ? (
                    <input
                      className="tab-label bg-transparent border-none outline-none focus:ring-0 px-0 m-0 w-full text-foreground"
                      style={{ marginLeft: 12 }}
                      autoFocus
                      defaultValue={tab.name}
                      onBlur={(e) => {
                        renameTab(tab.id, e.target.value);
                        setEditingTabId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          renameTab(tab.id, e.currentTarget.value);
                          setEditingTabId(null);
                        } else if (e.key === 'Escape') {
                          setEditingTabId(null);
                        }
                      }}
                    />
                  ) : (
                    <span className="tab-label select-none">{tab.name}</span>
                  )}
                  
                  {isSidebarOpen && editingTabId !== tab.id && (
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto mr-1 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTabId(tab.id);
                      }}
                      title="Rename"
                    >
                      <Pencil className="size-3" />
                    </button>
                  )}

                  {tabs.length > 1 && (
                    <button
                      className="tab-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                    >
                      <X className="size-2.5" />
                    </button>
                  )}
                </div>
              </TooltipTrigger>
              {!isSidebarOpen && (
                <TooltipContent side="right" sideOffset={8}>
                  <p className="text-xs font-medium">{tab.name}</p>
                </TooltipContent>
              )}
            </Tooltip>
          ))}

          <Tooltip>
            <TooltipTrigger asChild>
              <button className="tab-add" onClick={addTab}>
                <Plus className="size-4" />
                <span className="tab-label">New chat</span>
              </button>
            </TooltipTrigger>
            {!isSidebarOpen && (
              <TooltipContent side="right" sideOffset={8}>
                <p className="text-xs">New chat</p>
              </TooltipContent>
            )}
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button className="sidebar-profile-btn" onClick={() => setShowProfile(true)}>
                <div className="sidebar-profile-avatar">
                  <User className="size-4" />
                </div>
                <span className="tab-label">Profile</span>
              </button>
            </TooltipTrigger>
            {!isSidebarOpen && (
              <TooltipContent side="right" sideOffset={8}>
                <p className="text-xs">Profile</p>
              </TooltipContent>
            )}
          </Tooltip>
        </nav>

        <div className="flex flex-col min-w-0 flex-1">
          {/* ── Unified header: Agent title on left, connected + theme on right ── */}
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">Agent</h2>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  connected ? "text-emerald-600" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    connected ? "bg-emerald-500 animate-pulse-dot" : "bg-muted-foreground/50",
                  )}
                />
                {connected ? "connected" : "disconnected"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={toggle}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
            </div>
          </div>

          {/* ── Main content: TaskPane (wider) + InspectorPane (narrower) ── */}
          <main className="grid min-h-0 flex-1 relative" style={{ gridTemplateColumns: "1fr 320px" }}>
            <TaskPane events={tabEvents} send={tabSend} />
            <InspectorPane events={tabEvents} />

            {/* ── Profile View Modal ── */}
            {showProfile && (
              <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-20 flex flex-col p-8 animate-fade-slide-in overflow-y-auto">
                <div className="flex items-center justify-between mb-8 max-w-2xl mx-auto w-full">
                  <h2 className="text-2xl font-bold tracking-tight">Profile</h2>
                  <Button variant="ghost" size="icon" onClick={() => setShowProfile(false)} className="rounded-full">
                    <X className="size-5" />
                  </Button>
                </div>
                <div className="max-w-2xl w-full mx-auto space-y-6">
                  <div className="flex items-center gap-5 p-6 border border-border/50 rounded-2xl bg-card shadow-sm">
                    <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <User className="size-10" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-xl">User Profile</h3>
                      <p className="text-sm text-muted-foreground mt-1">user@example.com</p>
                    </div>
                  </div>
                  <div className="p-8 border border-border/50 rounded-2xl bg-card/50 shadow-sm flex flex-col items-center justify-center text-center">
                    <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Moon className="size-5 text-muted-foreground" />
                    </div>
                    <h4 className="font-medium text-lg mb-1">Preferences</h4>
                    <p className="text-sm text-muted-foreground">More profile settings and preferences coming soon.</p>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
