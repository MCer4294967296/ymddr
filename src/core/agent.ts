import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type { ModelProvider, Message } from "./model.js";
import type { Memory } from "../memory/memory.js";
import { ContextBuilder } from "../context/context.js";
import type { ToolRegistry } from "../tools/index.js";
import { logger } from "../utils/logger.js";
import * as fs from "node:fs";
import * as path from "node:path";

export enum AgentState {
  Normal,
  GracePeriod,
  Expired
}

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
  private session60MinTimer: NodeJS.Timeout | null = null;
  private sessionEnded = false;
  private agentId: string;
  private state: AgentState = AgentState.Normal;
  private timeRemainingMs: number = 60 * 60 * 1000;
  private sessionStartTime: number;

  constructor(
    model: ModelProvider,
    memory: Memory,
    context: ContextBuilder,
    tools: ToolRegistry,
    db: Database.Database,
    agentId: string = "default"
  ) {
    this.model = model;
    this.memory = memory;
    this.context = context;
    this.tools = tools;
    this.db = db;
    this.history = [];
    this.sessionMessages = [];
    this.agentId = agentId;
    this.sessionStartTime = Date.now();

    const sessionDir = "./memories/sessions";
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // 1. Reset any existing 10-minute timer and load state
    const pidFile = path.resolve(sessionDir, `timer_10min_${this.agentId}.pid`);
    const stateFile = path.resolve(sessionDir, `session_state_${this.agentId}.json`);
    let resumedSessionId: string | null = null;

    if (fs.existsSync(pidFile)) {
      try {
        const pidStr = fs.readFileSync(pidFile, "utf-8");
        const pid = parseInt(pidStr, 10);
        if (!isNaN(pid)) {
          process.kill(pid); // Cancel the detached timer
          console.log(`  ↳ Canceled previous 10-minute session timer (PID: ${pid})`);
        }
      } catch (err) {
        // process might not exist, ignore
      } finally {
        try { fs.unlinkSync(pidFile); } catch (e) {}
      }

      if (fs.existsSync(stateFile)) {
        try {
          const stateData = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
          if (stateData.sessionId && stateData.timeRemainingMs !== undefined) {
            resumedSessionId = stateData.sessionId;
            this.timeRemainingMs = stateData.timeRemainingMs;
            console.log(`  ↳ Resumed session ${resumedSessionId} with ${Math.round(this.timeRemainingMs / 60000)}m remaining.`);
          }
        } catch (e) {
          console.error("Failed to parse session state", e);
        }
      }
    }

    if (resumedSessionId) {
      this.sessionId = resumedSessionId;
      // Load transcript
      const transcriptFile = `./memories/sessions/${this.sessionId}.json`;
      if (fs.existsSync(transcriptFile)) {
        try {
          this.sessionMessages = JSON.parse(fs.readFileSync(transcriptFile, "utf-8"));
        } catch (e) {}
      }
    } else {
      this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
      this.timeRemainingMs = 60 * 60 * 1000;
    }

    // 2. Start a timer for the current session
    this.session60MinTimer = setTimeout(() => {
      this.state = AgentState.GracePeriod;
      console.log(`\n[System] Session time expired. One last prompt before the 60-minute script.`);
    }, this.timeRemainingMs);
    
    // Unref so it doesn't block the event loop if the app exits normally
    this.session60MinTimer.unref();
  }

  public getState(): AgentState {
    return this.state;
  }

  /** End the current session and start the 10-minute detached timer. */
  endSession(): void {
    if (this.sessionEnded) return;
    this.sessionEnded = true;

    if (this.session60MinTimer) {
      clearTimeout(this.session60MinTimer);
      this.session60MinTimer = null;
    }

    const sessionDir = "./memories/sessions";
    const pidFile = path.resolve(sessionDir, `timer_10min_${this.agentId}.pid`);
    const stateFile = path.resolve(sessionDir, `session_state_${this.agentId}.json`);

    const elapsed = Date.now() - this.sessionStartTime;
    this.timeRemainingMs = Math.max(0, this.timeRemainingMs - elapsed);

    fs.writeFileSync(stateFile, JSON.stringify({
      sessionId: this.sessionId,
      timeRemainingMs: this.timeRemainingMs
    }), "utf-8");

    const tenMinutesMs = 10 * 60 * 1000;
    const scriptPath = path.resolve("./scripts/timeout-10min.sh");
    const timerScript = path.resolve("./src/utils/detached-timer.ts");

    console.log(`  ↳ Session ended. Starting 10-minute timer in background...`);
    
    const { spawn } = require("node:child_process");
    const child = spawn("npx", ["tsx", timerScript, tenMinutesMs.toString(), scriptPath, pidFile], {
      detached: true,
      stdio: "ignore"
    });
    
    child.unref();
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

    if (this.state === AgentState.GracePeriod) {
      this.state = AgentState.Expired;
      console.log(`\n[Agent] Final prompt processed. Invoking 60-minute script...`);
      const scriptPath = path.resolve("./scripts/timeout-60min.sh");
      try {
        const { exec } = require("node:child_process");
        exec(scriptPath, (error: any, stdout: any, stderr: any) => {
          if (error) console.error(`Error executing 60-minute script: ${error.message}`);
          if (stdout) console.log(stdout);
          if (stderr) console.error(stderr);
        });
      } catch (e) {
        console.error("Failed to run 60-min timer script", e);
      }
    }

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
