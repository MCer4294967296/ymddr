import * as fs from "node:fs";
import * as path from "node:path";

const LOG_DIR = path.resolve(process.cwd(), "logs");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFile() {
  const date = new Date().toISOString().split("T")[0];
  return path.join(LOG_DIR, `agent-${date}.log`);
}

function appendLog(level: string, message: string) {
  const timestamp = new Date().toISOString();
  // Using multi-line format since responses and prompts can be long
  const logLine = `[${timestamp}] [${level}]\n${message}\n------------------------------------------------------------\n`;
  fs.appendFileSync(getLogFile(), logLine, "utf-8");
}

export const logger = {
  userPrompt: (prompt: string) => appendLog("USER_PROMPT", prompt),
  modelResponse: (response: string) => appendLog("MODEL_RESPONSE", response),
  agentResponse: (response: string) => appendLog("AGENT_RESPONSE", response),
};
