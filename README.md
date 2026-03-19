# Agent Chat — Paperclip Plugin

A full-page chat interface for having informal conversations with your [Paperclip](https://paperclip.dev) agents. Think of it as a water cooler for your AI team — ask questions, get context-aware answers, and have real back-and-forth conversations.

The key difference from a generic chatbot: **agents respond with full access to their workspace, codebase, project files, and tools.** When you ask the Software Architect about a design decision, they can go read the actual ADR. When you ask the Platform Engineer about a Docker issue, they can check the running containers.

## Features

- **Full-page UI** with agent list sidebar and spacious chat area
- **Persistent conversation history** per agent (stored in Paperclip plugin state)
- **Fire-and-forget messaging** — no timeout issues, even for long agent responses
- **Optimistic UI** — your message appears instantly; typing indicator shows while the agent thinks
- **Sidebar navigation link** for quick access
- **Zero dependencies** beyond the Plugin SDK and esbuild

## How It Works

1. You select an agent and type a message
2. The plugin saves your message and writes a conversation context file to disk
3. The agent wakes up via a session, reads the context file, and responds using its full workspace access
4. The UI polls for the response and displays it when ready

Each message triggers a full agent heartbeat — the agent isn't a stripped-down chatbot, it's the real agent with all its capabilities.

## Installation

### Prerequisites

- A running [Paperclip](https://paperclip.dev) instance
- Node.js 20+ (available inside the Paperclip container)
- Agents using the `claude_local` adapter (Claude Code)

### 1. Build the Plugin

Clone this repo into a directory accessible from your Paperclip container:

```bash
git clone https://github.com/bjmillerpa/paperclip-agent-chat.git
cd paperclip-agent-chat
```

Install dependencies and build (run inside the Paperclip container, or adjust the SDK path):

```bash
# If running inside the Paperclip container:
npm install
node build.mjs

# If running outside, update the SDK path in package.json first:
# "@paperclipai/plugin-sdk": "file:/path/to/paperclip/packages/plugins/sdk"
```

### 2. Register the Plugin

Register via the Paperclip plugin install API, or insert directly into the database:

```sql
INSERT INTO plugins (
  id, plugin_key, package_name, package_path,
  version, api_version, categories, manifest_json, status
) VALUES (
  gen_random_uuid(),
  'agent-chat',
  'paperclip-agent-chat',
  '/path/to/paperclip-agent-chat',
  '0.2.0',
  1,
  '["ui"]'::jsonb,
  '<manifest JSON — see src/manifest.js>'::jsonb,
  'ready'
);
```

Then restart your Paperclip container to pick up the new plugin.

### 3. Configure Your Agents

Each agent needs a small addition to its `AGENTS.md` (or equivalent instructions file) so it knows how to handle chat wakes. Add this section:

```markdown
## Agent Chat

If `$PAPERCLIP_WAKE_REASON` is `Agent Chat`, skip the normal heartbeat workflow. Instead:

1. Read your chat inbox file at `~/.agent-chat/<your-agent-id>.md`
   - Get your agent ID: `curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/agents/me" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])"`
2. Respond conversationally to the latest message from the board
3. You have full access to your workspace, project files, and tools — use them
4. Output your response as plain text and exit cleanly
5. Do NOT check the task inbox or do regular heartbeat work
```

That's it. The agent will now respond to chat messages using its full capabilities.

## Configuration

### Chat Directory

The plugin writes conversation context files so agents can read them. By default, it uses `$HOME/.agent-chat/`. Override with:

```bash
# In your Paperclip container's environment:
AGENT_CHAT_DIR=/path/to/chat/files
```

The directory must be readable by both the plugin worker (inside the Paperclip process) and the agent processes.

### History Limit

Conversation history is capped at 100 messages per agent. This is defined as `MAX_HISTORY_MESSAGES` in `src/worker.js`.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Browser — Agent Chat Page                      │
│  ┌──────────┐  ┌────────────────────────────┐   │
│  │ Agent    │  │ Chat Area                  │   │
│  │ List     │  │  Messages + typing indicator│  │
│  │          │  │  Input + send button       │   │
│  └──────────┘  └────────────────────────────┘   │
│       │              │          ▲                │
│       │         usePluginAction  │  usePluginData │
│       │         (send-message)   │  (chat-history)│
│       │              │          │   polls q/3s   │
└───────┼──────────────┼──────────┼────────────────┘
        │              ▼          │
┌───────┼─────────────────────────┼────────────────┐
│  Plugin Worker                  │                │
│       │                         │                │
│  ┌────┴─────┐  ┌───────────────┴──┐             │
│  │ agents   │  │ send-message     │             │
│  │ (data)   │  │ (action)         │             │
│  └──────────┘  │  1. Save user msg│             │
│                │  2. Write .md file│             │
│  ┌──────────┐  │  3. Return immediately         │
│  │ history  │  │  4. Background:  │             │
│  │ (data)   │◄─│     wake agent   │             │
│  └──────────┘  │     wait response│             │
│                │     save history │             │
│                └──────────────────┘             │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  Agent (Claude Code)                            │
│  1. Reads ~/.agent-chat/<id>.md                 │
│  2. Has full workspace + tool access            │
│  3. Responds conversationally                   │
│  4. Exits cleanly                               │
└─────────────────────────────────────────────────┘
```

### Key Design Decisions

**Fire-and-forget, not request-response.** The RPC bridge between UI and worker has a 30-second timeout. Agents can take minutes. The action saves the user message and starts the agent session in the background, returning immediately. The UI polls `chat-history` every 3 seconds to detect the response.

**File-based context, not prompt injection.** The conversation history is written as a markdown file that the agent reads with its normal file tools. This gives the agent the full conversation in a format it can reason about naturally.

**Optimistic local state with server reconciliation.** The user's message appears instantly via local React state. When the server history catches up (user message + agent response), the local state clears and server-persisted history takes over.

## File Structure

```
paperclip-agent-chat/
├── src/
│   ├── manifest.js      # Plugin manifest (slots, capabilities)
│   ├── worker.js         # Worker (data handlers, actions, agent sessions)
│   └── ui/
│       └── index.js      # React UI (createElement, no JSX)
├── build.mjs             # esbuild script (worker + manifest + UI)
├── package.json
├── LICENSE               # MIT
└── README.md
```

## Plugin SDK APIs Used

- **`ctx.data.register`** — `agents` (list agents), `chat-history` (per-agent history)
- **`ctx.actions.register`** — `send-message` (fire-and-forget), `clear-history`
- **`ctx.state.get/set`** — persisted chat history scoped per agent
- **`ctx.agents.sessions.create/sendMessage/close`** — wake agents and capture responses
- **`usePluginData`** — data fetching with `.refresh()` for polling
- **`usePluginAction`** — async action invocation
- **UI slots** — `page` (full-page chat), `sidebar` (navigation link)

## Blog Post

Read the full story behind building this plugin: [Building a Water Cooler for AI Agents](https://blog.claude.beej.cloud/2026/03/building-a-water-cooler-for-ai-agents/)

## License

MIT
