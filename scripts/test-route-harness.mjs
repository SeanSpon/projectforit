// Isolated API integration harness: real route handlers and real Neon data.
// Only Next's request-cookie context is adapted; no database/auth logic is mocked.
import { build } from "esbuild";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export async function installRouteHarness(origin) {
  const dir = resolve(".sites-runtime/api-tests"); await mkdir(dir, { recursive: true });
  const context = new AsyncLocalStorage();
  globalThis.__roomieTestCookies = async () => {
    const store = context.getStore(); if (!store) throw new Error("Missing test request context");
    return {
      get: key => store.cookies.has(key) ? { value: store.cookies.get(key) } : undefined,
      set: (key, value, options) => { store.cookies.set(key, value); store.setCookies.push(`${key}=${value}; Path=${options?.path || "/"}; HttpOnly; SameSite=Lax`); },
      delete: key => { store.cookies.delete(key); store.setCookies.push(`${key}=; Max-Age=0; Path=/`); },
    };
  };
  const cookiesShim = resolve(dir, "cookies.mjs");
  await writeFile(cookiesShim, "export const cookies = () => globalThis.__roomieTestCookies();\n");
  const handlers = new Map();
  for (const route of ["auth", "rooms", "household", "community", "health", "messages"]) {
    const outfile = resolve(dir, route + ".mjs");
    await build({ entryPoints: [`app/api/${route}/route.ts`], outfile, bundle: true, platform: "node", format: "esm", packages: "external", alias: { "next/headers": cookiesShim, "cloudflare:workers": resolve("db/node-env.ts") }, logLevel: "silent" });
    handlers.set(`/api/${route}`, await import(pathToFileURL(outfile)));
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.origin !== origin) return originalFetch(input, init); // Neon HTTP requests remain real.
    const request = new Request(input, init), route = handlers.get(url.pathname), handler = route?.[request.method];
    if (!handler) return new Response("Not found", { status: 404 });
    const cookies = new Map((request.headers.get("cookie") || "").split(";").filter(Boolean).map(s => { const index = s.indexOf("="); return [s.slice(0, index).trim(), s.slice(index + 1)]; }));
    const state = { cookies, setCookies: [] };
    return context.run(state, async () => { const response = await handler(request); for (const value of state.setCookies) response.headers.append("set-cookie", value); return response; });
  };
  return () => { globalThis.fetch = originalFetch; delete globalThis.__roomieTestCookies; };
}
