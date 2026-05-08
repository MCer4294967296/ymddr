import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "../config.js";
import { AnthropicProvider, GeminiProvider } from "../core/model.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface MemoryMetadata {
  [filename: string]: {
    referenceCount: number;
    lastReferenced: string[]; // ISO timestamps
  };
}

interface LlmConsolidationResult {
  newInsights: { content: string; suggestedLayer: string }[];
  referencedMemories: string[];
  demotedMemories: string[];
}

// ── Globals ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const agentId = args[0] || "default";
const sessionId = args[1];

if (!sessionId) {
  console.error("No sessionId provided to MemoryMaster.");
  process.exit(1);
}

const baseDir = path.resolve(`./data/${agentId}/memories`);
const layers = ["core", "long-term", "short-term"];

// ── Utilities ────────────────────────────────────────────────────────────────

function getMetadataPath(layer: string): string {
  return path.join(baseDir, layer, "metadata.json");
}

function loadMetadata(layer: string): MemoryMetadata {
  const metaPath = getMetadataPath(layer);
  if (fs.existsSync(metaPath)) {
    try {
      return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    } catch (e) {
      console.error(`Failed to load metadata for layer ${layer}`, e);
    }
  }
  return {};
}

function saveMetadata(layer: string, metadata: MemoryMetadata): void {
  const metaPath = getMetadataPath(layer);
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf-8");
}

function readAllMemoriesWithFilenames(): string {
  let allText = "";
  for (const layer of layers) {
    const layerDir = path.join(baseDir, layer);
    if (!fs.existsSync(layerDir)) continue;

    const files = fs.readdirSync(layerDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(layerDir, file), "utf-8");
        allText += `\n[Layer: ${layer} | File: ${file}]\n${content}\n`;
      } catch (e) {
        console.error(e);
      }
    }
  }
  return allText || "No existing memories.";
}

function generateFilename(layer: string): string {
  // Brand new memories get low priority by default (e.g. 50_uuid.md)
  // Higher priority (00-49) is reserved for heavily referenced items later.
  return `50_insight_${new Date().getTime().toString().slice(-6)}.md`;
}

function findFileLayer(filename: string): string | null {
  for (const layer of layers) {
    if (fs.existsSync(path.join(baseDir, layer, filename))) {
      return layer;
    }
  }
  return null;
}

// ── Main Logic ───────────────────────────────────────────────────────────────

async function consolidate() {
  console.log(`[MemoryMaster] Starting consolidation for session ${sessionId}...`);

  const transcriptPath = path.join(baseDir, "sessions", `${sessionId}.json`);
  if (!fs.existsSync(transcriptPath)) {
    console.error(`Session transcript not found: ${transcriptPath}`);
    return;
  }

  const transcript = fs.readFileSync(transcriptPath, "utf-8");
  const existingMemories = readAllMemoriesWithFilenames();

  const prompt = `You are the Memory Consolidation AI for the agent.
Your job is to read the transcript of a recently concluded working session and the agent's current existing memory files, and then perform memory consolidation.

### Existing Memories:
${existingMemories}

### Session Transcript:
${transcript}

### Instructions:
1. Identify any strong, new, or recurring themes/insights from the session that should be saved. Suggest which layer they belong to ("short-term", "long-term", or "core").
2. Identify which EXISTING memory files (by their exact "File" name) were relevant or referenced during this session.
3. Identify any EXISTING memory files that were explicitly contradicted, proven useless, or should be demoted/pruned.

Respond ONLY with a valid JSON object matching this schema, with NO markdown formatting around it:
{
  "newInsights": [
    { "content": "string of the new markdown memory", "suggestedLayer": "short-term" }
  ],
  "referencedMemories": ["exact_filename.md"],
  "demotedMemories": ["exact_filename.md"]
}`;

  const isAnthropic = config.modelName.toLowerCase().includes("claude");
  const model = isAnthropic
    ? new AnthropicProvider(config.anthropicApiKey, config.modelName)
    : new GeminiProvider(config.geminiApiKey, config.modelName);

  try {
    const responseText = await model.complete([{ role: "user", content: prompt }]);
    let result: LlmConsolidationResult;

    try {
      // Strip markdown code blocks if the model wrapped it
      const cleaned = responseText.replace(/^```json/m, "").replace(/```$/m, "").trim();
      result = JSON.parse(cleaned);
    } catch (e) {
      console.error("[MemoryMaster] Failed to parse LLM JSON output. Raw output:\n", responseText);
      return;
    }

    console.log(`[MemoryMaster] LLM output parsed. New insights: ${result.newInsights?.length || 0}. Referenced: ${result.referencedMemories?.length || 0}.`);

    // 1. Save new insights
    if (result.newInsights && Array.isArray(result.newInsights)) {
      for (const insight of result.newInsights) {
        const layer = layers.includes(insight.suggestedLayer) ? insight.suggestedLayer : "short-term";
        const filename = generateFilename(layer);
        const filepath = path.join(baseDir, layer, filename);
        
        if (!fs.existsSync(path.join(baseDir, layer))) {
          fs.mkdirSync(path.join(baseDir, layer), { recursive: true });
        }
        
        fs.writeFileSync(filepath, insight.content, "utf-8");
        console.log(`[MemoryMaster] Created new memory: ${layer}/${filename}`);
      }
    }

    // 2. Update reference counts
    if (result.referencedMemories && Array.isArray(result.referencedMemories)) {
      const now = new Date().toISOString();
      for (const filename of result.referencedMemories) {
        const layer = findFileLayer(filename);
        if (layer) {
          const meta = loadMetadata(layer);
          if (!meta[filename]) {
            meta[filename] = { referenceCount: 0, lastReferenced: [] };
          }
          meta[filename].referenceCount += 1;
          meta[filename].lastReferenced.unshift(now);
          if (meta[filename].lastReferenced.length > 10) {
            meta[filename].lastReferenced.pop(); // Keep only last 10
          }
          
          saveMetadata(layer, meta);
          console.log(`[MemoryMaster] Incremented reference count for ${layer}/${filename}`);

          // Logic to upgrade memory (e.g. adjust prefix or move layer) can be added here
          // e.g., if (meta[filename].referenceCount > 5 && layer === 'short-term') { ... }
        }
      }
    }

    // 3. Process demotions (for now, simply logging or dropping priority)
    if (result.demotedMemories && Array.isArray(result.demotedMemories)) {
      for (const filename of result.demotedMemories) {
        const layer = findFileLayer(filename);
        if (layer) {
          console.log(`[MemoryMaster] Demotion requested for ${layer}/${filename}. (Skipping actual deletion for safety).`);
          // Implementation of demotion (renaming prefix to 99_ or moving to a lower layer)
        }
      }
    }

    console.log("[MemoryMaster] Consolidation complete.");

  } catch (err) {
    console.error("[MemoryMaster] Error during consolidation:", err);
  }
}

consolidate();
