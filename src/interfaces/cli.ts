import * as readline from "node:readline";
import type { Agent } from "../core/agent.js";

export function startCli(agent: Agent): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\nymddr> ",
  });

  console.log('Type your message and press Enter. Type ".exit" to quit.\n');
  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input === ".exit") {
      console.log("Goodbye.");
      agent.endSession();
      rl.close();
      process.exit(0);
    }

    try {
      const response = await agent.processMessage(input);
      console.log(`\n${response}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n[error] ${message}`);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nSession ended.");
    agent.endSession();
    process.exit(0);
  });
}
