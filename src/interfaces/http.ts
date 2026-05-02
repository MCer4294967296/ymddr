import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Agent } from "../core/agent.js";

export function startHttpServer(agent: Agent, port: number): void {
  const app = new Hono();

  // Health check
  app.get("/health", (c) => c.json({ status: "ok" }));

  // Chat endpoint
  app.post("/chat", async (c) => {
    try {
      const body = await c.req.json<{ message?: string }>();

      if (!body.message || typeof body.message !== "string") {
        return c.json({ error: "Request body must include a 'message' string." }, 400);
      }

      const response = await agent.processMessage(body.message);
      return c.json({ response });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[http error] ${message}`);
      return c.json({ error: "Internal server error." }, 500);
    }
  });

  serve({ fetch: app.fetch, port }, () => {
    console.log(`  ↳ HTTP server listening on http://localhost:${port}`);
  });
}
