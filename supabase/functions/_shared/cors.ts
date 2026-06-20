// Shared CORS headers. create-invoice is called from the browser via
// supabase.functions.invoke, so it must answer the preflight and echo CORS on
// the real response. The webhook is server-to-server and doesn't need these.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
