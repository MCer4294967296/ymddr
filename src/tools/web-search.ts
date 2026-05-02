import type { Tool } from "./index.js";

export const webSearchTool: Tool = {
  name: "web-search",
  description: "Search the web for information on a given query.",
  execute: async (_input: string): Promise<string> => {
    return "Web search is not implemented yet.";
  },
};
