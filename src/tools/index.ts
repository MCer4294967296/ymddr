// ── Types ────────────────────────────────────────────────────────────────────

export interface Tool {
  name: string;
  description: string;
  execute: (input: string) => Promise<string>;
}

// ── Tool Registry ────────────────────────────────────────────────────────────

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /** Register a tool. Throws if a tool with the same name already exists. */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Get a tool by name. Returns undefined if not found. */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** List all registered tools. */
  listAll(): Tool[] {
    return Array.from(this.tools.values());
  }
}
