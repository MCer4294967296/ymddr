# ymddr — Project Setup Prompt

Set up a TypeScript project called "ymddr" — a singleton AI agent/assistant framework. This is the foundational scaffolding, not a finished product. I'll iterate on it over time.

## Project Structure

```
ymddr/
  src/
    index.ts          # Entry point — boots the server and loads state
    core/
      agent.ts        # Main orchestration loop — receives input, runs pipeline, returns response
      memory.ts       # Memory layer — read/write/search notes and facts, backed by SQLite
      context.ts      # Context builder — assembles the prompt from conversation history + relevant memories + system prompt
      model.ts        # Model interface — abstract layer for calling an LLM (start with Anthropic Claude API, but keep it swappable)
    interfaces/
      cli.ts          # stdin/stdout interface for terminal interaction
      http.ts         # Express or Hono HTTP server with a simple /chat POST endpoint
    tools/
      index.ts        # Tool registry — define and register tools the agent can use
      web-search.ts   # Example tool stub — web search (just the interface, not implemented)
    config.ts         # Configuration — API keys, model selection, system prompt, SQLite path
  data/
    ymddr.db          # SQLite database (auto-created at boot)
  package.json
  tsconfig.json
  .env.example        # Template for API keys
```

## Key Design Principles

### 1. Model-agnostic

`model.ts` should export an interface like:

```typescript
interface ModelProvider {
  complete(messages: Message[]): Promise<string>
}
```

With a concrete `AnthropicProvider` implementation using the Anthropic SDK. I'll add `LocalModelProvider` later that hits a local inference server endpoint.

### 2. Persistent singleton state

All memory and conversation history persists to SQLite via `better-sqlite3`. On startup, ymddr loads its state. On crash/restart, it picks up where it left off. The agent should feel continuous.

### 3. Memory layer

The memory module should support:

- `addNote(content: string, tags?: string[])` — agent stores a fact or observation
- `searchNotes(query: string)` — simple keyword search for now, I'll add embeddings later
- `getRecentNotes(n: number)` — retrieve latest notes
- `deleteNote(id: string)` — remove a note

Notes are stored in SQLite with columns: `id`, `content`, `tags` (JSON), `created_at`, `updated_at`.

### 4. Context builder

Before each LLM call, the context builder assembles:

- System prompt (from config)
- Relevant memories (searched by keywords from the current input)
- Recent conversation history (last N messages, configurable)
- Current user input

It returns a `Message[]` array ready to send to the model provider.

### 5. Conversation history

Stored in SQLite. Each message has: `id`, `role` (user/assistant), `content`, `timestamp`. History is per-session for now but sessions persist across restarts.

### 6. Tool system

A simple registry where tools are defined with a name, description, and execute function. The agent doesn't need to auto-select tools yet — just have the infrastructure so I can wire it up later.

### 7. Two interfaces, same agent

- **CLI:** readline-based, for quick terminal interaction during development
- **HTTP:** a POST `/chat` endpoint that accepts `{ message: string }` and returns `{ response: string }`. This is for future frontends, phone access, etc.

Both interfaces talk to the same agent singleton instance.

## What I Don't Need Yet

- Frontend/UI
- Streaming responses
- Multi-user support
- Authentication
- Embeddings or vector search
- Tool auto-selection / function calling
- RAG pipeline

## Tech Choices

- TypeScript with `tsx` for dev, no build step needed
- `better-sqlite3` for persistence (synchronous API is fine)
- Anthropic SDK (`@anthropic-ai/sdk`) for the initial model provider
- Express or Hono for HTTP
- `dotenv` for config
- `uuid` for IDs

## Expected Result

Give me a working project I can `npm install && npx tsx src/index.ts` and start chatting with via terminal. Include a simple system prompt that says something like "You are ymddr, a personal assistant. You can take notes for future reference."