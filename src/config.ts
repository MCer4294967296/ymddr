import "dotenv/config";

export interface Config {
  anthropicApiKey: string;
  modelName: string;
  sqlitePath: string;
  httpPort: number;
  maxHistoryMessages: number;
  systemPrompt: string;
}

export const config: Config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  modelName: process.env.MODEL_NAME ?? "claude-sonnet-4-20250514",
  sqlitePath: process.env.SQLITE_PATH ?? "./data/ymddr.db",
  httpPort: parseInt(process.env.HTTP_PORT ?? "3000", 10),
  maxHistoryMessages: parseInt(process.env.MAX_HISTORY_MESSAGES ?? "20", 10),
  systemPrompt:
    process.env.SYSTEM_PROMPT ??
    "You are ymddr, a personal assistant. You can take notes for future reference.",
};
