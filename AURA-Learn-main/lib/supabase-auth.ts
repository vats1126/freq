import "server-only";
import type { Role } from "./types";

interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

interface SupabaseSession {
  access_token: string;
  user: SupabaseUser;
}

interface AuthResponse {
  user: SupabaseUser;
  session: SupabaseSession | null;
}

export interface SupabaseIdentity {
  id: string;
  email: string;
  name: string;
  /** This role is used only when initially provisioning a locally unknown account. */
  requestedRole: Role;
}

export class SupabaseAuthError extends Error {
  constructor(message: string, public status: number, public retryAfterSeconds?: number) {
    super(message);
  }
}

const DEFAULT_SUPABASE_URL = "https://wipkaskntseobnzpecdh.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_RkLnMEPrji6BhI8AsjaX7w_B5cWnD_B";

function config() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL)?.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_KEY;
  if (!url || !key) throw new SupabaseAuthError("Authentication is not configured yet. Add the Supabase URL and publishable key to .env.local.", 503);
  return { url, key };
}

function messageFrom(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const source = payload as Record<string, unknown>;
  const candidate = source.msg ?? source.message ?? source.error_description ?? source.error;
  return typeof candidate === "string" && candidate.length <= 240 ? candidate : fallback;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const { url, key } = config();
  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new SupabaseAuthError("Could not reach the authentication service. Please try again.", 503);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new SupabaseAuthError(
      messageFrom(payload, "Authentication could not be completed."),
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
  return payload as T;
}

/** A raw provider message is useful in logs, but this gives a learner a safe, actionable next step. */
export function authErrorMessage(error: SupabaseAuthError) {
  if (error.status === 429 || /rate limit|too many/i.test(error.message)) {
    return "Email confirmation is temporarily rate-limited by Supabase. For local testing, disable Confirm Email in Supabase. For a live app, configure custom SMTP. Then wait before trying again.";
  }
  return error.message;
}

function identityOf(user: SupabaseUser): SupabaseIdentity {
  const email = user.email?.trim().toLowerCase();
  if (!user.id || !email) throw new SupabaseAuthError("The authentication service returned an incomplete account.", 502);
  const metadata = user.user_metadata ?? {};
  const suppliedName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  const name = suppliedName.slice(0, 60) || email.split("@")[0];
  const requestedRole: Role = metadata.role === "facilitator" ? "facilitator" : "student";
  return { id: user.id, email, name, requestedRole };
}

export async function signUpWithSupabase(input: { name: string; email: string; password: string; role: Role }) {
  const response = await request<AuthResponse>("/signup", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      data: { full_name: input.name, role: input.role },
    }),
  });
  return { identity: { ...identityOf(response.user), name: input.name, requestedRole: input.role }, session: response.session };
}

export async function signInWithSupabase(input: { email: string; password: string }) {
  const response = await request<SupabaseSession>("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return { identity: identityOf(response.user), session: response };
}
