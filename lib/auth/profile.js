import { rewriteStorageUrl } from "../supabase/storageUrl";

// Migrate any legacy *.supabase.co host on stored image fields to the current
// SDK base (the proxy host). Avatar and banner are stored as full URLs, so any
// rows uploaded before the Russia/Cloudflare proxy swap still embed the old
// host; this rewrites them transparently on read.
function rewriteProfileUrls(row) {
  if (!row) return row;
  return {
    ...row,
    avatar_url: rewriteStorageUrl(row.avatar_url),
    banner_url: rewriteStorageUrl(row.banner_url),
  };
}

function pickMetadata(user) {
  const meta = user?.user_metadata || {};
  const identityMeta = user?.identities?.[0]?.identity_data || {};
  const merged = { ...identityMeta, ...meta };

  const provider = user?.app_metadata?.provider || user?.identities?.[0]?.provider || null;

  const avatarUrl =
    merged.avatar_url ||
    merged.picture ||
    merged.image_url ||
    null;

  const displayName =
    merged.full_name ||
    merged.name ||
    merged.global_name ||
    merged.user_name ||
    merged.preferred_username ||
    (user?.email ? user.email.split("@")[0] : null) ||
    "Builder";

  const baseUsername =
    merged.user_name ||
    merged.preferred_username ||
    merged.username ||
    (user?.email ? user.email.split("@")[0] : null) ||
    user?.id?.slice(0, 8) ||
    "user";

  const username = String(baseUsername)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
    .slice(0, 24) || `user_${user?.id?.slice(0, 6) || "new"}`;

  const discordId = provider === "discord" ? merged.provider_id || merged.sub || null : null;

  return { provider, avatarUrl, displayName, username, discordId };
}

// Force the useful properties of an Error / PostgrestError into a plain
// object so DevTools doesn't print it as `{}` (most properties on Error
// instances are non-enumerable, which silently hides what actually went
// wrong).
function describeError(err) {
  if (!err) return null;
  const out = {
    code: err.code || err.name || null,
    message: err.message || null,
    details: err.details ?? null,
    hint: err.hint ?? null,
    status: err.status ?? null,
  };
  // Supabase/Postgrest errors sometimes arrive as plain objects whose fields
  // are all empty, which prints as a useless `{}`. Fall back to a serialized
  // copy so the console always shows *something* actionable.
  if (!out.message) {
    try {
      out.message = JSON.stringify(err) || String(err);
    } catch {
      out.message = String(err);
    }
  }
  return out;
}

function isUniqueViolation(err) {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key|unique constraint|already exists/i.test(err.message || "");
}

export async function ensureProfile(supabase, user) {
  if (!supabase || !user) return { profile: null, created: false, skipped: true };

  // Select the full set of columns AccountPage / OfferDetail / etc. actually
  // read. Caching the full row in AuthContext means downstream pages can render
  // straight from cache on reload instead of firing their own duplicate
  // profiles SELECT — which is what was causing the 5+ concurrent profile
  // queries pile-up on slow Supabase.
  const PROFILE_COLUMNS =
    "id, username, display_name, avatar_url, banner_url, bio, role, interests, preferred_server_type, minecraft_username, onboarding_completed_at, is_admin";

  try {
    // eslint-disable-next-line no-console
    console.debug("[ensureProfile] looking up profile for", user.id);
    const { data: existing, error: fetchError } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle();

    if (fetchError && fetchError.code !== "PGRST116") {
      // eslint-disable-next-line no-console
      console.error("[ensureProfile] SELECT failed:", describeError(fetchError));
      return { profile: null, created: false, error: fetchError, skipped: false };
    }

    if (existing) {
      // eslint-disable-next-line no-console
      console.debug("[ensureProfile] existing row found");
      return { profile: rewriteProfileUrls(existing), created: false, skipped: false };
    }

    const meta = pickMetadata(user);
    const baseRow = {
      id: user.id,
      username: meta.username,
      display_name: meta.displayName,
      // Don't seed the profile avatar from the OAuth provider (e.g. Discord).
      // A blank avatar should stay blank until the user picks one; the navbar
      // still falls back to the provider picture via displayInfoFromUser.
      avatar_url: null,
      discord_id: meta.discordId,
      role: null
    };

    // Create the row. Two realistic failure modes for a brand-new user:
    //   1. Primary-key race — the onboarding gate and AuthContext both run
    //      ensureProfile at once. A plain INSERT makes the loser throw 23505
    //      ("INSERT failed") even though the row was created fine. `upsert`
    //      with `ignoreDuplicates` turns that into a harmless no-op; we refetch
    //      the winner's row below.
    //   2. The derived @handle (or discord_id) collides with a DIFFERENT
    //      existing row's UNIQUE column. We recover by retrying with a
    //      guaranteed-unique handle and no discord_id.
    async function insertRow(row) {
      return supabase
        .from("profiles")
        .upsert(row, { onConflict: "id", ignoreDuplicates: true })
        .select(PROFILE_COLUMNS);
    }

    // eslint-disable-next-line no-console
    console.debug("[ensureProfile] inserting new row:", baseRow);
    let { data: insertedRows, error: insertError } = await insertRow(baseRow);

    if (insertError && isUniqueViolation(insertError)) {
      const suffix = String(user.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 6) || "new";
      const uniqueRow = {
        ...baseRow,
        username: `${String(baseRow.username || "user").slice(0, 17)}_${suffix}`.toLowerCase(),
        discord_id: null
      };
      // eslint-disable-next-line no-console
      console.warn("[ensureProfile] a unique column was taken; retrying with handle", uniqueRow.username);
      ({ data: insertedRows, error: insertError } = await insertRow(uniqueRow));
    }

    if (insertError) {
      // eslint-disable-next-line no-console
      console.error("[ensureProfile] INSERT failed:", describeError(insertError));
      const { data: refetched } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", user.id)
        .maybeSingle();

      if (refetched) {
        return { profile: rewriteProfileUrls(refetched), created: false, skipped: false };
      }

      return { profile: null, created: false, error: insertError, skipped: false };
    }

    const inserted = Array.isArray(insertedRows) ? insertedRows[0] : insertedRows;
    if (inserted) {
      // eslint-disable-next-line no-console
      console.debug("[ensureProfile] inserted ok");
      return { profile: rewriteProfileUrls(inserted), created: true, skipped: false };
    }

    // Insert was ignored — the row already existed (concurrent insert won the
    // race). Fetch the existing row so the caller still gets a profile back.
    // eslint-disable-next-line no-console
    console.debug("[ensureProfile] row already existed; refetching");
    const { data: refetched } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle();
    return { profile: rewriteProfileUrls(refetched) || null, created: false, skipped: false };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[ensureProfile] threw:", describeError(error));
    return { profile: null, created: false, error, skipped: false };
  }
}

export function displayInfoFromUser(user, profile) {
  if (!user) return null;
  const meta = pickMetadata(user);
  // The profile row is the source of truth for the avatar. We deliberately do
  // NOT fall back to the OAuth provider picture (e.g. Discord): a blank avatar
  // should stay blank everywhere — including the navbar menu — so the initial
  // placeholder shows instead. `trim()` guards against an empty string.
  const chosenAvatar = String(profile?.avatar_url || "").trim();
  return {
    id: user.id,
    email: user.email || null,
    displayName: profile?.display_name || meta.displayName,
    username: profile?.username || meta.username,
    avatarUrl: chosenAvatar || null,
    role: profile?.role || null,
    provider: meta.provider
  };
}
