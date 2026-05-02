import Anthropic from "@anthropic-ai/sdk";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ModelProvider {
  complete(messages: Message[]): Promise<string>;
}

// ── Anthropic Implementation ─────────────────────────────────────────────────

export class AnthropicProvider implements ModelProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(messages: Message[]): Promise<string> {
    // Extract system prompt — Anthropic expects it as a separate top-level param
    const systemMessages = messages.filter((m) => m.role === "system");
    const conversationMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemMessages.map((m) => m.content).join("\n\n"),
      messages: conversationMessages,
    });

    // Extract text from response content blocks
    const textBlocks = response.content.filter(
      (block) => block.type === "text"
    );
    return textBlocks.map((block) => block.text).join("");
  }
}
