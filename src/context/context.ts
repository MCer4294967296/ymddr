import type { Memory, MemoryLayers } from "../memory/memory.js";
import type { Message } from "../core/model.js";
import type { ToolRegistry } from "../tools/index.js";

export class ContextBuilder {
  private memory: Memory;
  private systemPrompt: string;
  private maxHistory: number;

  constructor(memory: Memory, systemPrompt: string, maxHistory: number) {
    this.memory = memory;
    this.systemPrompt = systemPrompt;
    this.maxHistory = maxHistory;
  }

  /**
   * Assemble the full message array for an LLM call.
   *
   * Order:
   *   1. System prompt (with memory context injected)
   *   2. Recent conversation history (last N messages)
   *   3. Current user input
   */
  build(conversationHistory: Message[], userInput: string, tools?: ToolRegistry): Message[] {
    const messages: Message[] = [];

    // 1. System prompt + relevant memories + tools
    let system = this.systemPrompt;
    
    if (tools) {
      const toolList = tools.listAll();
      if (toolList.length > 0) {
        system += `\n\nYou have access to the following tools:\n`;
        toolList.forEach(t => {
          system += `- ${t.name}: ${t.description}\n`;
        });
        system += `\nTo use a tool, you MUST respond in the following EXACT format:\n<tool_call>\n{"name": "tool_name", "input": "your input string"}\n</tool_call>\n\nWait for the system to provide the tool's result before answering the user. If you do not need to use a tool, simply respond to the user normally.`;
      }
    }

    const memories = this.memory.getAllMemories();

    if (memories.core.length > 0 || memories.longTerm.length > 0 || memories.shortTerm.length > 0) {
      system += `\n\n=== RELEVANT MEMORY CONTEXT ===\n`;
      
      if (memories.core.length > 0) {
        system += `\n[Core Memory]\n${memories.core.join("\n\n")}\n`;
      }
      if (memories.longTerm.length > 0) {
        system += `\n[Long-term Memory]\n${memories.longTerm.join("\n\n")}\n`;
      }
      if (memories.shortTerm.length > 0) {
        system += `\n[Short-term Memory]\n${memories.shortTerm.join("\n\n")}\n`;
      }
    }

    messages.push({ role: "system", content: system });

    // 2. Recent conversation history
    const recent = conversationHistory.slice(-this.maxHistory);
    messages.push(...recent);

    // 3. Current user input
    messages.push({ role: "user", content: userInput });

    return messages;
  }
}
