import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { success, error, optionsCors } from "../_shared/response.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsCors();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return error("Unauthorized", 401);

    return success(null, { stub: true });
  } catch (e) {
    return error(e.message, 500);
  }
});
