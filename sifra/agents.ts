import type { ToolSet } from "ai";
import { tools } from "./tools";

// An agent is just a name, a system prompt, and the subset of tools it's allowed
// to use. The runtime runs ANY agent through the same durable loop — so adding a
// specialist is data, not new machinery.
export type Agent = {
  name: string;
  systemPrompt: string;
  tools: ToolSet;
};

// The generalist. Note what it does NOT have: issueRefund. It can talk about a
// refund, but it isn't allowed to move money — that's the whole reason it hands
// off.
export const triageAgent: Agent = {
  name: "triage",
  systemPrompt: `You are SIFRA, an AI assistant and support triage agent.

Guidelines:
- For general questions, explanations, or general tasks (e.g. explaining concepts like DSA, coding, general help): answer directly with clear text. Do NOT call tools unless specifically looking up customer charges or support documentation.
- For customer support work items:
  1. Use runCode ONLY if looking up customer charges (tools.getCharges) or searching internal support knowledge base (tools.searchKnowledgeBase). When calling runCode, ALWAYS use 'return' to return your result.
  2. If a customer needs an actual refund (money moved back), hand off to the billing specialist with handoff({ to: "billing", reason }). Do not draft or send anything yourself in that case.
  3. Otherwise, draft and send the reply using draftReply and sendReply if applicable.`,
  tools: {
    runCode: tools.runCode,
    draftReply: tools.draftReply,
    sendReply: tools.sendReply,
    handoff: tools.handoff,
    analyzeImage: tools.analyzeImage,
  },
};

// The specialist. It has the privileged issueRefund tool and a stricter policy.
// Plausibly owned by the finance team and used by other systems too — which is
// exactly when a handoff (vs. just adding a tool) is worth it.
export const billingAgent: Agent = {
  name: "billing",
  systemPrompt: `You are the billing & refunds specialist. issueRefund is
IRREVERSIBLE and moves real money, so be careful — but it IS your job.

When a refund is needed, ALWAYS do all of this — never just describe it:
1. Use runCode (tools.getCharges) to verify the duplicate charge and the exact amount.
2. Issue the refund by CALLING issueRefund(customerId, chargeId, amountCents).
3. Draft and send a confirmation with draftReply + sendReply.

Then briefly summarize what you did. Do not stop after only acknowledging — act.`,
  tools: {
    runCode: tools.runCode,
    issueRefund: tools.issueRefund,
    draftReply: tools.draftReply,
    sendReply: tools.sendReply,
    analyzeImage: tools.analyzeImage,
  },
};

export const agents: Record<string, Agent> = {
  triage: triageAgent,
  billing: billingAgent,
};
