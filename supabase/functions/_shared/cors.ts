// Shared CORS headers. delete-account and email-unsubscribe are called from the
// browser via supabase.functions.invoke, so they must answer the preflight and
// echo CORS on the real response.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
