import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type { ModelProvider, Message } from "./model.js";
import type { Memory } from "../memory/memory.js";
import { ContextBuilder } from "../context/context.js";
import type { ToolRegistry } from "../tools/index.js";
import { logger } from "../utils/logger.js";
import * as fs from "node:fs";

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
  private sessionId: string;
  private sessionMessages: Message[];

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
    this.sessionMessages = [];
    this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');

    const sessionDir = "./memories/sessions";
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
  }

  /** Persist a message to the session JSON file. */
  private saveMessage(message: Message): void {
    this.sessionMessages.push(message);
    const filePath = `./memories/sessions/${this.sessionId}.json`;
    fs.writeFileSync(filePath, JSON.stringify(this.sessionMessages, null, 2), "utf-8");
  }

  async processMessage(input: string): Promise<string> {
    logger.userPrompt(input);

    // Save user input to history immediately
    this.saveMessage({ role: "user", content: input });

    // Build initial context. We pass all history except the current input to avoid duplication
    // because ContextBuilder.build appends the user input at the end.
    let currentMessages = this.context.build(this.history, input, this.tools);
    this.history.push({ role: "user", content: input });

    let finalResponse = "";

    while (true) {
      // Call the model
      const response = await this.model.complete(currentMessages);

      logger.modelResponse(response);

      // Check for tool call
      const toolCallMatch = response.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/);

      if (toolCallMatch) {
        let toolResult = "";
        try {
          const toolCall = JSON.parse(toolCallMatch[1]);
          const tool = this.tools.get(toolCall.name);
          if (tool) {
            console.log(`  [Tool] Calling ${tool.name}...`);
            toolResult = await tool.execute(toolCall.input);
          } else {
            toolResult = `Error: Tool "${toolCall.name}" not found.`;
          }
        } catch (err: any) {
          toolResult = `Error parsing or executing tool call: ${err.message}`;
        }

        // Add the model's intermediate response and the tool's result to the message chain
        currentMessages.push({ role: "assistant", content: response });
        currentMessages.push({ role: "system", content: `Tool Result:\n${toolResult}` });

        // Also note down tool calls in the session
        this.saveMessage({ role: "assistant", content: response });
        this.saveMessage({ role: "system", content: `Tool Result:\n${toolResult}` });
      } else {
        // No tool call means this is the final response
        finalResponse = response;
        break;
      }
    }

    logger.agentResponse(finalResponse);

    // Persist final assistant response
    this.saveMessage({ role: "assistant", content: finalResponse });
    this.history.push({ role: "assistant", content: finalResponse });

    return finalResponse;
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
