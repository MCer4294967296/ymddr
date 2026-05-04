import type { Memory, Note } from "../memory/memory.js";
import type { Message } from "../core/model.js";
import type { ToolRegistry } from "../tools/index.js";

// Common English stop words to filter out during keyword extraction
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "but", "and", "or", "if", "while", "about", "up",
  "it", "its", "i", "me", "my", "we", "our", "you", "your", "he", "him",
  "his", "she", "her", "they", "them", "their", "what", "which", "who",
  "this", "that", "these", "those", "am",
]);

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
   *   1. System prompt (with memory context injected if relevant notes found)
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

    const relevantNotes = this.findRelevantNotes(userInput);

    if (relevantNotes.length > 0) {
      const notesBlock = relevantNotes
        .map((n) => `- [${n.id.slice(0, 8)}] ${n.content}`)
        .join("\n");
      system += `\n\nHere are some of your saved notes that may be relevant:\n${notesBlock}`;
    }

    messages.push({ role: "system", content: system });

    // 2. Recent conversation history
    const recent = conversationHistory.slice(-this.maxHistory);
    messages.push(...recent);

    // 3. Current user input
    messages.push({ role: "user", content: userInput });

    return messages;
  }

  /** Extract keywords from input and search memory. */
  private findRelevantNotes(input: string): Note[] {
    const keywords = this.extractKeywords(input);
    if (keywords.length === 0) return [];

    // Search for each keyword and deduplicate by id
    const seen = new Set<string>();
    const results: Note[] = [];

    for (const keyword of keywords) {
      const notes = this.memory.searchNotes(keyword);
      for (const note of notes) {
        if (!seen.has(note.id)) {
          seen.add(note.id);
          results.push(note);
        }
      }
    }

    // Cap at 10 to avoid blowing up context
    return results.slice(0, 10);
  }

  /** Simple keyword extraction — split, lowercase, filter stop words and short tokens. */
  private extractKeywords(input: string): string[] {
    return input
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  }
}
