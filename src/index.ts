import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import { AnthropicProvider, GeminiProvider } from "./core/model.js";
import { Memory } from "./core/memory.js";
import { ContextBuilder } from "./core/context.js";
import { Agent } from "./core/agent.js";
import { ToolRegistry } from "./tools/index.js";
import { webSearchTool } from "./tools/web-search.js";
import { startHttpServer } from "./interfaces/http.js";
import { startCli } from "./interfaces/cli.js";

// ── Boot ─────────────────────────────────────────────────────────────────────

function boot(): void {
  console.log("\n  ╭──────────────────────────╮");
  console.log("  │        y m d d r         │");
  console.log("  ╰──────────────────────────╯\n");

  // Ensure data directory exists
  const dbDir = path.dirname(config.sqlitePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`  ↳ Created data directory: ${dbDir}`);
  }

  // Open SQLite database
  const db = new Database(config.sqlitePath);
  db.pragma("journal_mode = WAL");
  console.log(`  ↳ Database: ${config.sqlitePath}`);

  // Initialize core components
  const model = new GeminiProvider(config.geminiApiKey, config.modelName);
  console.log(`  ↳ Model: ${config.modelName}`);

  const memory = new Memory(db);
  const context = new ContextBuilder(
    memory,
    config.systemPrompt,
    config.maxHistoryMessages
  );

  // Tool registry
  const tools = new ToolRegistry();
  tools.register(webSearchTool);
  console.log(`  ↳ Tools: ${tools.listAll().map((t) => t.name).join(", ")}`);

  // Create the singleton agent
  const agent = new Agent(model, memory, context, tools, db);

  // Start interfaces
  startHttpServer(agent, config.httpPort);
  startCli(agent);
}

boot();
