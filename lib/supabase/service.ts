import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client that bypasses RLS entirely — for server-only jobs with no user session to
 * scope a request to (e.g. the reminders cron, which needs to read every user's data to decide
 * who to notify). Never import this from anything reachable by a client request; every route
 * using it must do its own authorization check first (see /api/cron/reminders).
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
