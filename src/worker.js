import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { writeFile, mkdir, unlink } from "node:fs/promises";

const STATE_NAMESPACE = "agent-chat";
const STATE_KEY = "history";
const MAX_HISTORY_MESSAGES = 100;

// Chat context files are written here so agents can read them.
// Set AGENT_CHAT_DIR in your environment, or edit this fallback path.
const AGENT_CHAT_DIR = process.env.AGENT_CHAT_DIR || "/home/bjmillerpa/.agent-chat";

/**
 * Agent Chat Plugin Worker
 *
 * Fire-and-forget pattern: the send-message action saves the user message
 * and kicks off the agent session in the background, returning immediately.
 * The UI polls chat-history to detect the agent's response.
 */
const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("Agent Chat plugin setup complete");

    // -----------------------------------------------------------------------
    // Data: list agents for a company
    // -----------------------------------------------------------------------
    ctx.data.register("agents", async (params) => {
      const companyId = String(params.companyId ?? "");
      if (!companyId) return [];
      const agents = await ctx.agents.list({ companyId, limit: 50 });
      return agents.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
      }));
    });

    // -----------------------------------------------------------------------
    // Data: get chat history for a specific agent
    // -----------------------------------------------------------------------
    ctx.data.register("chat-history", async (params) => {
      const agentId = String(params.agentId ?? "");
      if (!agentId) return [];
      const history = await ctx.state.get({
        scopeKind: "agent",
        scopeId: agentId,
        namespace: STATE_NAMESPACE,
        stateKey: STATE_KEY,
      });
      return Array.isArray(history) ? history : [];
    });

    // -----------------------------------------------------------------------
    // Action: send a message to an agent (fire-and-forget)
    // -----------------------------------------------------------------------
    ctx.actions.register("send-message", async (params) => {
      const agentId = String(params.agentId ?? "");
      const companyId = String(params.companyId ?? "");
      const message = String(params.message ?? "").trim();

      if (!agentId) throw new Error("agentId is required");
      if (!companyId) throw new Error("companyId is required");
      if (!message) throw new Error("message cannot be empty");

      // Load existing history and append user message
      const existing = await ctx.state.get({
        scopeKind: "agent",
        scopeId: agentId,
        namespace: STATE_NAMESPACE,
        stateKey: STATE_KEY,
      });
      const history = Array.isArray(existing) ? [...existing] : [];

      history.push({
        role: "user",
        text: message,
        timestamp: new Date().toISOString(),
      });

      // Save immediately so the UI can see the user message + pending state
      await ctx.state.set({
        scopeKind: "agent",
        scopeId: agentId,
        namespace: STATE_NAMESPACE,
        stateKey: STATE_KEY,
      }, history.slice(-MAX_HISTORY_MESSAGES));

      // Fire off agent processing in the background — don't await
      processAgentResponse(ctx, agentId, companyId, message, history).catch((err) => {
        ctx.logger.error("Background agent response failed", {
          agentId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      // Return immediately — UI will poll chat-history for the response
      return { ok: true, status: "pending" };
    });

    // -----------------------------------------------------------------------
    // Action: clear chat history for an agent
    // -----------------------------------------------------------------------
    ctx.actions.register("clear-history", async (params) => {
      const agentId = String(params.agentId ?? "");
      if (!agentId) throw new Error("agentId is required");

      await ctx.state.set({
        scopeKind: "agent",
        scopeId: agentId,
        namespace: STATE_NAMESPACE,
        stateKey: STATE_KEY,
      }, []);

      return { ok: true };
    });
  },

  async onHealth() {
    return { status: "ok", message: "Agent Chat plugin is ready" };
  },
});

/**
 * Background: wake the agent, wait for response, save to history.
 * Runs outside the RPC timeout window.
 */
async function processAgentResponse(ctx, agentId, companyId, message, history) {
  const chatFilePath = `${AGENT_CHAT_DIR}/${agentId}.md`;
  let sessionId = null;

  ctx.logger.info("processAgentResponse starting", { agentId, chatFilePath });

  try {
    // Write conversation context file for the agent
    await mkdir(AGENT_CHAT_DIR, { recursive: true });
    const content = buildChatFile(history, message);
    await writeFile(chatFilePath, content, "utf8");
    ctx.logger.info("Chat file written", { chatFilePath, contentLength: content.length });

    // Create session and send message
    const session = await ctx.agents.sessions.create(agentId, companyId, {
      reason: "Agent Chat",
    });
    sessionId = session.sessionId;
    ctx.logger.info("Session created, sending message", { sessionId });

    let resolveDone, rejectDone;
    const donePromise = new Promise((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });

    let stdoutBuffer = "";

    await ctx.agents.sessions.sendMessage(session.sessionId, companyId, {
      prompt: message,
      reason: "Agent Chat",
      onEvent: (event) => {
        if (event.eventType === "chunk" && event.stream === "stdout") {
          stdoutBuffer += event.message ?? "";
        } else if (event.eventType === "done") {
          resolveDone();
        } else if (event.eventType === "error") {
          rejectDone(new Error(event.message ?? "Agent run failed"));
        }
      },
    });

    await donePromise;

    // Parse JSONL for the clean result text
    let responseText = "";
    for (const line of stdoutBuffer.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj.type === "result" && typeof obj.result === "string") {
          responseText = obj.result;
          break;
        }
      } catch {
        // not JSON — skip
      }
    }

    history.push({
      role: "agent",
      text: responseText || "(no text output)",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    ctx.logger.error("Agent chat response error", { agentId, error: errorMsg });
    history.push({
      role: "error",
      text: `Error: ${errorMsg}`,
      timestamp: new Date().toISOString(),
    });
  } finally {
    try { await unlink(chatFilePath); } catch { /* best effort */ }
    if (sessionId) {
      try { await ctx.agents.sessions.close(sessionId, companyId); } catch { /* best effort */ }
    }
  }

  // Save completed history
  await ctx.state.set({
    scopeKind: "agent",
    scopeId: agentId,
    namespace: STATE_NAMESPACE,
    stateKey: STATE_KEY,
  }, history.slice(-MAX_HISTORY_MESSAGES));
}

/**
 * Build the markdown file the agent reads to understand the chat context.
 */
function buildChatFile(history, latestMessage) {
  const priorMessages = history.slice(0, -1);

  const lines = [
    "# Agent Chat",
    "",
    "You have received a direct message from the board via Agent Chat. **Skip the normal heartbeat workflow.** Respond conversationally to the latest message — you have full access to your workspace, project files, and tools. Output your response as plain prose and then exit cleanly.",
    "",
  ];

  if (priorMessages.length > 0) {
    lines.push("## Conversation History", "");
    for (const msg of priorMessages) {
      const role = msg.role === "user" ? "Board" : msg.role === "agent" ? "You" : "System";
      lines.push(`**${role}:** ${msg.text}`, "");
    }
    lines.push("---", "");
  }

  lines.push("## Latest Message from Board", "", latestMessage, "");

  return lines.join("\n");
}

export default plugin;
runWorker(plugin, import.meta.url);
