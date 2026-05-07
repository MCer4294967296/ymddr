import * as fs from "node:fs";
import * as path from "node:path";

import { config } from "./config.js";
import { AnthropicProvider, GeminiProvider } from "./core/model.js";
import { Memory } from "./memory/memory.js";
import { ContextBuilder } from "./context/context.js";
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

  // Initialize core components
  const model = new GeminiProvider(config.geminiApiKey, config.modelName);
  console.log(`  ↳ Model: ${config.modelName}`);

  const agentId = "default";
  const memory = new Memory(agentId);
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
  const agent = new Agent(model, memory, context, tools, agentId);

  // Start interfaces
  startHttpServer(agent, config.httpPort);
  startCli(agent);
}

boot();
