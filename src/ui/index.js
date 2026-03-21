import {
  createElement as h,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  useHostContext,
  usePluginData,
  usePluginAction,
} from "@paperclipai/plugin-sdk/ui";
import { marked } from "marked";

// Configure marked for safe, clean output
marked.setOptions({
  breaks: true,       // GFM line breaks
  gfm: true,          // GitHub-flavored markdown
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const STYLES = `
/* Layout */
.ac-page {
  display: flex;
  height: 100%;
  font-family: inherit;
  color: inherit;
  box-sizing: border-box;
  overflow: hidden;
}

/* Left: Agent List */
.ac-sidebar {
  width: 260px;
  min-width: 220px;
  border-right: 1px solid var(--color-border, #e5e7eb);
  display: flex;
  flex-direction: column;
  background: var(--color-bg-subtle, var(--color-bg-secondary, #fafafa));
  flex-shrink: 0;
}
.ac-sidebar-header {
  padding: 16px 16px 12px;
  font-size: 15px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  display: flex;
  align-items: center;
  gap: 8px;
}
.ac-sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ac-agent-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  width: 100%;
  color: inherit;
  font-size: 14px;
  transition: background 0.1s;
}
.ac-agent-btn:hover {
  background: var(--color-bg-hover, rgba(0,0,0,0.05));
}
.ac-agent-btn.selected {
  background: var(--color-bg-selected, rgba(59,130,246,0.1));
  color: var(--color-primary, #3b82f6);
}
.ac-agent-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.ac-agent-title {
  font-size: 11px;
  color: var(--color-text-subtle, #6b7280);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ac-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ac-status-dot.active { background: #22c55e; }
.ac-status-dot.idle { background: #f59e0b; }
.ac-status-dot.other { background: #94a3b8; }

/* Right: Chat Area */
.ac-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
.ac-chat-header {
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.ac-chat-header-name {
  font-size: 16px;
  font-weight: 600;
}
.ac-chat-header-status {
  font-size: 12px;
  color: var(--color-text-subtle, #6b7280);
  display: flex;
  align-items: center;
  gap: 6px;
}
.ac-clear-btn {
  font-size: 12px;
  color: var(--color-text-subtle, #9ca3af);
  background: none;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  cursor: pointer;
  padding: 4px 10px;
  transition: all 0.1s;
}
.ac-clear-btn:hover { color: #ef4444; border-color: #ef4444; }

/* Messages */
.ac-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ac-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: var(--color-text-subtle, #6b7280);
  text-align: center;
  padding: 40px;
}
.ac-empty-icon { font-size: 36px; opacity: 0.4; }
.ac-empty-hint { font-size: 13px; opacity: 0.7; }

.ac-msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 720px;
}
.ac-msg.user { align-self: flex-end; }
.ac-msg.agent { align-self: flex-start; }
.ac-msg.error { align-self: flex-start; }

.ac-bubble {
  padding: 10px 16px;
  border-radius: 16px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
}
.ac-msg.user .ac-bubble {
  background: var(--color-primary, #3b82f6);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.ac-msg.agent .ac-bubble {
  background: var(--color-bg-secondary, #f3f4f6);
  color: inherit;
  border-bottom-left-radius: 4px;
}
.ac-msg.error .ac-bubble {
  background: rgba(239,68,68,0.08);
  color: #ef4444;
  border: 1px solid rgba(239,68,68,0.2);
}
.ac-msg-meta {
  font-size: 11px;
  color: var(--color-text-subtle, #9ca3af);
  padding: 0 4px;
}
.ac-msg.user .ac-msg-meta { text-align: right; }

/* Typing indicator */
.ac-typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  background: var(--color-bg-secondary, #f3f4f6);
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  align-self: flex-start;
}
.ac-typing-label {
  font-size: 12px;
  color: var(--color-text-subtle, #9ca3af);
  margin-left: 6px;
}
.ac-typing-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-text-subtle, #9ca3af);
  animation: ac-bounce 1.2s ease-in-out infinite;
}
.ac-typing-dot:nth-child(2) { animation-delay: 0.2s; }
.ac-typing-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes ac-bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-6px); }
}

/* Input area */
.ac-input-area {
  padding: 16px 24px 20px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  flex-shrink: 0;
}
.ac-input-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.ac-textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 12px;
  padding: 12px 16px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.45;
  background: var(--color-bg, var(--color-bg-subtle, #fff));
  color: var(--color-text, inherit);
  outline: none;
  box-sizing: border-box;
  min-height: 48px;
  max-height: 200px;
}
.ac-textarea::placeholder { color: var(--color-text-subtle, #9ca3af); }
.ac-textarea:focus { border-color: var(--color-primary, #3b82f6); box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
.ac-textarea:disabled { opacity: 0.6; cursor: not-allowed; }
.ac-send-btn {
  padding: 10px 20px;
  background: var(--color-primary, #3b82f6);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.1s;
  white-space: nowrap;
  height: 48px;
}
.ac-send-btn:hover:not(:disabled) { opacity: 0.9; }
.ac-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ac-input-hint {
  font-size: 11px;
  color: var(--color-text-subtle, #9ca3af);
  margin-top: 6px;
  padding-left: 4px;
}

/* Rendered markdown inside agent bubbles */
.ac-bubble p { margin: 0 0 0.5em; }
.ac-bubble p:last-child { margin-bottom: 0; }
.ac-bubble h1, .ac-bubble h2, .ac-bubble h3, .ac-bubble h4 {
  margin: 0.6em 0 0.3em;
  font-size: 1em;
  font-weight: 600;
}
.ac-bubble h1 { font-size: 1.15em; }
.ac-bubble h2 { font-size: 1.08em; }
.ac-bubble ul, .ac-bubble ol {
  margin: 0.3em 0;
  padding-left: 1.4em;
}
.ac-bubble li { margin: 0.15em 0; }
.ac-bubble code {
  background: rgba(0,0,0,0.06);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}
.ac-bubble pre {
  background: rgba(0,0,0,0.06);
  padding: 8px 10px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.4em 0;
}
.ac-bubble pre code {
  background: none;
  padding: 0;
}
.ac-bubble blockquote {
  border-left: 3px solid var(--color-border, #d1d5db);
  margin: 0.4em 0;
  padding: 2px 10px;
  color: var(--color-text-subtle, #6b7280);
}
.ac-bubble table {
  border-collapse: collapse;
  margin: 0.4em 0;
  font-size: 0.92em;
}
.ac-bubble th, .ac-bubble td {
  border: 1px solid var(--color-border, #d1d5db);
  padding: 4px 8px;
  text-align: left;
}
.ac-bubble th { font-weight: 600; background: rgba(0,0,0,0.03); }
.ac-bubble a { color: var(--color-primary, #3b82f6); text-decoration: underline; }
.ac-msg.user .ac-bubble code { background: rgba(255,255,255,0.15); }
.ac-msg.user .ac-bubble pre { background: rgba(255,255,255,0.1); }
.ac-msg.user .ac-bubble a { color: #fff; }
.ac-msg.user .ac-bubble blockquote { border-left-color: rgba(255,255,255,0.4); color: rgba(255,255,255,0.8); }
.ac-msg.user .ac-bubble th, .ac-msg.user .ac-bubble td { border-color: rgba(255,255,255,0.3); }
.ac-msg.user .ac-bubble th { background: rgba(255,255,255,0.1); }

/* No agent selected */
.ac-no-agent {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-subtle, #9ca3af);
  font-size: 15px;
}
.ac-no-agent-icon { font-size: 40px; opacity: 0.3; }

/* Dark mode overrides — Paperclip may not set all CSS variables */
@media (prefers-color-scheme: dark) {
  .ac-sidebar { background: var(--color-bg-subtle, #1e1e2e); }
  .ac-textarea { background: var(--color-bg, #1e1e2e); color: var(--color-text, #e0e0e0); border-color: var(--color-border, #3a3a4a); }
  .ac-textarea::placeholder { color: var(--color-text-subtle, #888); }
  .ac-agent-btn { color: var(--color-text, #e0e0e0); }
  .ac-agent-btn:hover { background: var(--color-bg-hover, rgba(255,255,255,0.06)); }
  .ac-agent-title { color: var(--color-text-subtle, #888); }
  .ac-msg.agent .ac-bubble { background: var(--color-bg-secondary, #2a2a3a); color: var(--color-text, #e0e0e0); }
  .ac-typing { background: var(--color-bg-secondary, #2a2a3a); }
  .ac-bubble code { background: rgba(255,255,255,0.08); }
  .ac-bubble pre { background: rgba(255,255,255,0.08); }
  .ac-bubble th { background: rgba(255,255,255,0.05); }
  .ac-bubble th, .ac-bubble td { border-color: var(--color-border, #3a3a4a); }
  .ac-bubble blockquote { border-left-color: var(--color-border, #3a3a4a); }
}
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.textContent = STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function statusDotClass(status) {
  if (status === "active" || status === "running") return "active";
  if (status === "idle") return "idle";
  return "other";
}

function formatTime(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------
function renderMarkdown(text) {
  try { return marked.parse(text); }
  catch { return text; }
}

function MessageBubble({ msg, agentName }) {
  const roleClass = msg.role === "user" ? "user" : msg.role === "error" ? "error" : "agent";
  const label = msg.role === "user" ? "You" : msg.role === "error" ? "Error" : (agentName || "Agent");
  // Render markdown for agent/error messages; keep user messages as plain text
  const bubble = msg.role === "user"
    ? h("div", { className: "ac-bubble" }, msg.text)
    : h("div", { className: "ac-bubble", dangerouslySetInnerHTML: { __html: renderMarkdown(msg.text) } });
  return h("div", { className: `ac-msg ${roleClass}` },
    bubble,
    h("div", { className: "ac-msg-meta" }, `${label} \u00b7 ${formatTime(msg.timestamp)}`)
  );
}

// ---------------------------------------------------------------------------
// Full-page Chat — main exported component
// ---------------------------------------------------------------------------
export function AgentChatPage({ context }) {
  injectStyles();

  const companyId = context?.companyId;
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  // Local messages lets us show user message + agent reply instantly
  // without waiting for a data refresh round-trip.
  const [localMessages, setLocalMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Data hooks
  const agentsResult = usePluginData("agents", companyId ? { companyId } : null);
  const historyResult = usePluginData(
    "chat-history",
    selectedAgentId && companyId ? { agentId: selectedAgentId, companyId } : null,
  );

  // Actions
  const sendMessage = usePluginAction("send-message");
  const clearHistory = usePluginAction("clear-history");

  // Merge server history with optimistic local messages
  const serverHistory = useMemo(
    () => (Array.isArray(historyResult.data) ? historyResult.data : []),
    [historyResult.data],
  );

  const messages = useMemo(() => {
    // If local messages exist, they extend server history
    if (localMessages.length > 0) {
      // Server history may already contain our local messages after a refresh.
      // Use server history length to decide: if server has more, it's caught up.
      if (serverHistory.length >= localMessages[0]?._serverLen + localMessages.length) {
        return serverHistory;
      }
      return [...serverHistory.slice(0, localMessages[0]?._serverLen ?? serverHistory.length), ...localMessages];
    }
    return serverHistory;
  }, [serverHistory, localMessages]);

  // Clear local messages when server catches up
  useEffect(() => {
    if (localMessages.length > 0 && serverHistory.length >= (localMessages[0]?._serverLen ?? 0) + localMessages.length) {
      setLocalMessages([]);
    }
  }, [serverHistory.length, localMessages]);

  // Track the expected message count so we know when the agent has responded
  const expectedCountRef = useRef(null);

  // Reset local state on agent switch
  useEffect(() => {
    setLocalMessages([]);
    setIsSending(false);
    setDraftMessage("");
    expectedCountRef.current = null;
  }, [selectedAgentId]);

  // Poll chat-history while waiting for agent response
  useEffect(() => {
    if (!isSending) return;
    const interval = setInterval(() => {
      historyResult.refresh();
    }, 3000);
    return () => clearInterval(interval);
  }, [isSending]);

  // Detect when server history catches up (agent responded)
  useEffect(() => {
    if (isSending && expectedCountRef.current !== null && serverHistory.length >= expectedCountRef.current) {
      // Agent response arrived — clear sending state
      setIsSending(false);
      setLocalMessages([]);
      expectedCountRef.current = null;
      if (textareaRef.current) textareaRef.current.focus();
    }
  }, [serverHistory.length, isSending]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  // Focus textarea when agent selected
  useEffect(() => {
    if (selectedAgentId && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [selectedAgentId]);

  const handleSend = useCallback(async () => {
    const msg = draftMessage.trim();
    if (!msg || !selectedAgentId || !companyId || isSending) return;

    const now = new Date().toISOString();
    const userMsg = { role: "user", text: msg, timestamp: now, _serverLen: serverHistory.length };

    setDraftMessage("");
    setIsSending(true);
    setLocalMessages([userMsg]);
    // We expect server history to grow by 2 (user msg + agent response)
    expectedCountRef.current = serverHistory.length + 2;

    try {
      await sendMessage({ agentId: selectedAgentId, companyId, message: msg });
      // Action returns immediately (fire-and-forget). Polling will detect the response.
    } catch (err) {
      const errorMsg = {
        role: "error",
        text: `Error: ${err?.message || String(err)}`,
        timestamp: new Date().toISOString(),
        _serverLen: serverHistory.length,
      };
      setLocalMessages((prev) => [...prev, errorMsg]);
      setIsSending(false);
      expectedCountRef.current = null;
      historyResult.refresh();
    }
  }, [draftMessage, selectedAgentId, companyId, isSending, sendMessage, serverHistory.length]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleClear = useCallback(async () => {
    if (!selectedAgentId || !companyId) return;
    if (!confirm("Clear chat history with this agent?")) return;
    try {
      await clearHistory({ agentId: selectedAgentId, companyId });
      setLocalMessages([]);
      historyResult.refresh();
    } catch { /* ignore */ }
  }, [selectedAgentId, companyId, clearHistory, historyResult]);

  // Auto-resize textarea
  const handleInput = useCallback((e) => {
    setDraftMessage(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  const agents = Array.isArray(agentsResult.data) ? agentsResult.data : [];
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return h("div", { className: "ac-page" },
    // ---- Left sidebar: agent list ----
    h("div", { className: "ac-sidebar" },
      h("div", { className: "ac-sidebar-header" },
        h("span", null, "Agent Chat"),
      ),
      h("div", { className: "ac-sidebar-list" },
        agentsResult.loading && h("div", { style: { padding: "8px 12px", color: "#9ca3af", fontSize: "13px" } }, "Loading agents\u2026"),
        agents.map((agent) =>
          h("button", {
            key: agent.id,
            className: `ac-agent-btn${selectedAgentId === agent.id ? " selected" : ""}`,
            onClick: () => setSelectedAgentId(agent.id),
          },
            h("span", { className: `ac-status-dot ${statusDotClass(agent.status)}` }),
            h("div", { style: { flex: 1, minWidth: 0 } },
              h("div", { className: "ac-agent-name" }, agent.name),
            )
          )
        )
      )
    ),

    // ---- Right: Chat area ----
    !selectedAgentId
      ? h("div", { className: "ac-no-agent" },
          h("div", { className: "ac-no-agent-icon" }, "\uD83D\uDCAC"),
          h("div", null, "Select an agent to start chatting"),
        )
      : h("div", { className: "ac-chat" },
          // Header
          h("div", { className: "ac-chat-header" },
            h("div", null,
              h("div", { className: "ac-chat-header-name" }, selectedAgent?.name ?? "Agent"),
              h("div", { className: "ac-chat-header-status" },
                h("span", { className: `ac-status-dot ${statusDotClass(selectedAgent?.status)}` }),
                h("span", null, selectedAgent?.status ?? "unknown"),
              ),
            ),
            h("button", { className: "ac-clear-btn", onClick: handleClear }, "Clear history"),
          ),

          // Messages
          h("div", { className: "ac-messages" },
            messages.length === 0 && !isSending
              ? h("div", { className: "ac-empty" },
                  h("div", { className: "ac-empty-icon" }, "\uD83C\uDF0A"),
                  h("div", null, `Start a conversation with ${selectedAgent?.name ?? "this agent"}`),
                  h("div", { className: "ac-empty-hint" }, "They have full access to their workspace, project files, and tools."),
                )
              : messages.map((msg, i) => h(MessageBubble, { key: i, msg, agentName: selectedAgent?.name })),

            // Typing indicator while waiting for agent
            isSending && h("div", { className: "ac-typing" },
              h("div", { className: "ac-typing-dot" }),
              h("div", { className: "ac-typing-dot" }),
              h("div", { className: "ac-typing-dot" }),
              h("span", { className: "ac-typing-label" }, `${selectedAgent?.name ?? "Agent"} is thinking\u2026`),
            ),

            h("div", { ref: messagesEndRef }),
          ),

          // Input
          h("div", { className: "ac-input-area" },
            h("div", { className: "ac-input-row" },
              h("textarea", {
                ref: textareaRef,
                className: "ac-textarea",
                placeholder: `Message ${selectedAgent?.name ?? "agent"}\u2026`,
                value: draftMessage,
                disabled: isSending,
                onChange: handleInput,
                onKeyDown: handleKeyDown,
                rows: 1,
              }),
              h("button", {
                className: "ac-send-btn",
                disabled: !draftMessage.trim() || isSending,
                onClick: handleSend,
              }, isSending ? "Thinking\u2026" : "Send"),
            ),
            h("div", { className: "ac-input-hint" }, "Ctrl+Enter to send"),
          ),
        ),
  );
}

// ---------------------------------------------------------------------------
// Sidebar link — navigates to the full chat page
// ---------------------------------------------------------------------------
export function AgentChatSidebarLink({ context }) {
  injectStyles();
  const prefix = context?.companyPrefix;
  const href = prefix ? `/${prefix}/agent-chat` : "/agent-chat";
  const isActive = typeof window !== "undefined" && window.location.pathname === href;

  return h("a", {
    href,
    "aria-current": isActive ? "page" : undefined,
    style: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "8px 12px",
      fontSize: "13px",
      fontWeight: 500,
      color: "inherit",
      textDecoration: "none",
      borderRadius: "6px",
      background: isActive ? "var(--color-bg-selected, rgba(59,130,246,0.1))" : "transparent",
      transition: "background 0.1s",
    },
  },
    h("span", { style: { fontSize: "15px" } }, "\uD83D\uDCAC"),
    h("span", null, "Agent Chat"),
  );
}
