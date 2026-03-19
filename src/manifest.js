/**
 * Agent Chat Plugin Manifest
 *
 * Full-page chat interface for informal conversations with individual agents.
 * Also registers a sidebar link for quick navigation to the chat page.
 */

const manifest = {
  id: "community.agent-chat",
  apiVersion: 1,
  version: "0.2.0",
  displayName: "Agent Chat",
  description: "Water-cooler style chat — have informal conversations with individual Paperclip agents.",
  author: "BJ Software",
  categories: ["ui"],
  capabilities: [
    "agents.read",
    "agent.sessions.create",
    "agent.sessions.list",
    "agent.sessions.send",
    "agent.sessions.close",
    "plugin.state.read",
    "plugin.state.write",
    "ui.sidebar.register",
    "ui.page.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "page",
        id: "agent-chat-page",
        displayName: "Agent Chat",
        exportName: "AgentChatPage",
        routePath: "agent-chat",
      },
      {
        type: "sidebar",
        id: "agent-chat-sidebar-link",
        displayName: "Agent Chat",
        exportName: "AgentChatSidebarLink",
      },
    ],
  },
};

export default manifest;
