import { z } from "zod";
import { currentUser, sameOrigin } from "@/lib/auth";
export const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const invitation = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  )
    .join("")
    .toUpperCase();
export const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^(?:[A-F0-9]{16}|[A-F0-9]{32})$/,
    "Enter the room or floor code exactly as shared.",
  );
export const id = z.string().uuid();
export const short = z.string().trim().min(1).max(80);
export const body = z.string().trim().min(1).max(2000);
export async function parseRequest<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  limit = 12000,
): Promise<{
  user: NonNullable<Awaited<ReturnType<typeof currentUser>>>;
  data: z.infer<T>;
}> {
  if (!sameOrigin(request))
    throw Object.assign(new Error("Request origin is not allowed."), {
      status: 403,
    });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw Object.assign(new Error("JSON required."), { status: 415 });
  const user = await currentUser();
  if (!user) throw Object.assign(new Error("Sign in first."), { status: 401 });
  const raw = await request.text();
  if (raw.length > limit)
    throw Object.assign(new Error("Request too large."), { status: 413 });
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Invalid JSON."), { status: 400 });
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw Object.assign(
      new Error(parsed.error.issues[0]?.message || "Invalid input."),
      { status: 400 },
    );
  return { user, data: parsed.data };
}
export function apiError(error: unknown) {
  let e = error as {
    status?: number;
    message?: string;
    code?: string;
    cause?: unknown;
  };
  if (e?.status) return reply({ error: e.message }, e.status);
  while (e?.cause) e = e.cause as typeof e;
  if (e?.code === "23505")
    return reply(
      {
        error:
          "That room number, invitation, or pending connection already exists.",
      },
      409,
    );
  if (e?.code === "P0001")
    return reply(
      { error: e.message },
      /Only|cannot|not found/i.test(e.message || "") ? 403 : 409,
    );
  return reply(
    { error: "Could not save or load your data. Please try again." },
    503,
  );
}
