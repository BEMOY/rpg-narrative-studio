import { createClient } from "@supabase/supabase-js";

// Publishable (anon) key — safe to ship in a client bundle by design.
// All access control happens server-side via Postgres RLS policies
// (see migrations: invite_gated_auth, projects_table, security_hardening).
const SUPABASE_URL = "https://aikggisrlozglxhjvirg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ofp_n7UtfNTve3z_6pKzAw_lsUBaZx7";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
