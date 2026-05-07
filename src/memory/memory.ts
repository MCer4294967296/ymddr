import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MemoryLayers {
  core: string[];
  longTerm: string[];
  shortTerm: string[];
}

// ── Memory Layer ─────────────────────────────────────────────────────────────

export class Memory {
  private agentId: string;
  private baseDir: string;

  constructor(agentId: string = "default") {
    this.agentId = agentId;
    this.baseDir = path.resolve(`./data/${this.agentId}/memories`);
    this.init();
  }

  /** Create the memory directories if they don't exist. */
  private init(): void {
    const layers = ["core", "long-term", "short-term"];
    for (const layer of layers) {
      const layerDir = path.join(this.baseDir, layer);
      if (!fs.existsSync(layerDir)) {
        fs.mkdirSync(layerDir, { recursive: true });
      }
    }
  }

  /** Retrieve all memory markdown files mapped by layer. */
  getAllMemories(): MemoryLayers {
    return {
      core: this.readLayer("core"),
      longTerm: this.readLayer("long-term"),
      shortTerm: this.readLayer("short-term"),
    };
  }

  private readLayer(layer: string): string[] {
    const layerDir = path.join(this.baseDir, layer);
    if (!fs.existsSync(layerDir)) return [];

    const files = fs.readdirSync(layerDir).filter(f => f.endsWith('.md'));
    const contents: string[] = [];
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(layerDir, file), "utf-8");
        contents.push(`--- ${file} ---\n${content}`);
      } catch (err) {
        console.error(`Failed to read memory file ${file}:`, err);
      }
    }
    
    return contents;
  }
}
