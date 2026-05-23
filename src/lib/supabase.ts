import { createClient } from "@supabase/supabase-js";
import { assertServerEnv, config } from "@/lib/config";

export function supabaseAdmin() {
  assertServerEnv();
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
