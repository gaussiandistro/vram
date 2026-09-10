import { supabase } from "./supabase.js";

let motd = null;

export async function loadMotd() {
  if (!supabase) return;

  const { data, error } = await supabase.from("motd").select("message").eq("id", 1).maybeSingle();

  if (error) throw error;

  motd = data?.message || null;
}

export function getMotd() {
  return motd;
}
