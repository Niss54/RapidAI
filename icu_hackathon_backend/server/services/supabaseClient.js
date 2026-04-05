const { createClient } = require("@supabase/supabase-js");

let supabase;

function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return false;
  }

  if (url.startsWith("your_") || key.startsWith("your_")) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getSupabaseClient() {
  if (supabase) {
    return supabase;
  }

  if (!isSupabaseConfigured()) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY");
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  supabase = createClient(url, key);
  return supabase;
}

module.exports = {
  getSupabaseClient,
  isSupabaseConfigured,
};
