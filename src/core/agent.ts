import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type { ModelProvider, Message } from "./model.js";
import type { Memory } from "./memory.js";
import { ContextBuilder } from "./context.js";
import type { ToolRegistry } from "../tools/index.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface MessageRow {
  id: string;
  role: string;
  content: string;
  timestamp: string;
}

// ── Agent ────────────────────────────────────────────────────────────────────

export class Agent {
  private model: ModelProvider;
  private memory: Memory;
  private context: ContextBuilder;
  private tools: ToolRegistry;
  private db: Database.Database;
  private history: Message[];

  constructor(
    model: ModelProvider,
    memory: Memory,
    context: ContextBuilder,
    tools: ToolRegistry,
    db: Database.Database
  ) {
    this.model = model;
    this.memory = memory;
    this.context = context;
    this.tools = tools;
    this.db = db;
    this.history = [];
    this.initDb();
    this.loadHistory();
  }

  /** Create the messages table if it doesn't exist. */
  private initDb(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id        TEXT PRIMARY KEY,
        role      TEXT NOT NULL,
        content   TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);
  }

  /** Load conversation history from SQLite on startup. */
  private loadHistory(): void {
    const rows = this.db
      .prepare(`SELECT * FROM messages ORDER BY timestamp ASC`)
      .all() as MessageRow[];

    this.history = rows.map((row) => ({
      role: row.role as Message["role"],
      content: row.content,
    }));

    if (this.history.length > 0) {
      console.log(`  ↳ Loaded ${this.history.length} messages from history`);
    }
  }

  /** Persist a message to SQLite. */
  private saveMessage(role: Message["role"], content: string): void {
    this.db
      .prepare(
        `INSERT INTO messages (id, role, content, timestamp) VALUES (?, ?, ?, ?)`
      )
      .run(uuidv4(), role, content, new Date().toISOString());
  }

  /**
   * Main orchestration loop.
   * Receives user input → builds context → calls LLM → persists → returns response.
   */
  async processMessage(input: string): Promise<string> {
    // Build context from history + memories + input
    const messages = this.context.build(this.history, input);

    // Call the model
    const response = await this.model.complete(messages);

    // Persist both sides of the conversation
    this.saveMessage("user", input);
    this.history.push({ role: "user", content: input });

    this.saveMessage("assistant", response);
    this.history.push({ role: "assistant", content: response });

    return response;
  }

  /** Expose memory for direct access (e.g., from tools or interfaces). */
  getMemory(): Memory {
    return this.memory;
  }

  /** Expose tool registry. */
  getTools(): ToolRegistry {
    return this.tools;
  }
}
