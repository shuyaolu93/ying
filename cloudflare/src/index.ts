import { DurableObject } from "cloudflare:workers";

interface Env {
  RONGHE_CONTAINER: DurableObjectNamespace<RongheContainer>;
}

async function waitForContainer(container: NonNullable<DurableObjectState["container"]>) {
  if (!container.running) container.start();
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await container.getTcpPort(8787).fetch("http://container/health");
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await scheduler.wait(250);
  }
  throw new Error("Ronghe container did not become ready", { cause: lastError });
}

export class RongheContainer extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const container = this.ctx.container;
    await container.setInactivityTimeout(10 * 60 * 1000);
    await waitForContainer(container);
    const url = new URL(request.url);
    url.protocol = "http:";
    url.hostname = "container";
    return container.getTcpPort(8787).fetch(new Request(url, request));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
      });
    }
    const container = env.RONGHE_CONTAINER.getByName("ronghe-api");
    return container.fetch(request);
  },
};
