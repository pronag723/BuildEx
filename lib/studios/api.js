"use client";

import { getSupabaseClient } from "../supabase/client";
import { rewriteStorageUrl, rewriteUrlsDeep } from "../supabase/storageUrl";
import { startsFromPrice, ratesToTiers } from "../pricing";
import { uploadPortfolioImage } from "../onboarding/api";

export const STUDIO_COLUMNS =
  "id, name, slug, logo_url, status, moderator_id, rates, " +
  "platform_commission_bps, employee_commission_bps, accepting_orders, " +
  "available_employees, avg_rating, reviews_count, completed_orders, payout_method, payout_details, " +
  "created_at, claimed_at";

const PUBLIC_STUDIO_COLUMNS =
  "id, name, slug, logo_url, status, rates, accepting_orders, available_employees, " +
  "avg_rating, reviews_count, completed_orders, created_at, claimed_at";

function mapPortfolio(rows) {
  return (rows || [])
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((row) => ({
      id: row.id,
      title: row.alt || "Studio build",
      thumbnail: rewriteStorageUrl(row.url),
      images: [rewriteStorageUrl(row.url)],
      storage_path: row.storage_path || null,
      position: row.position || 0,
    }));
}

export function mapStudioRow(row) {
  if (!row) return null;
  const portfolio = mapPortfolio(row.portfolio);
  const rates = row.rates && typeof row.rates === "object" ? row.rates : {};
  const availableCount =
    Number(row.available_employees ?? row.available_members?.[0]?.count ?? row.available_count) || 0;
  return {
    id: row.id,
    provider_type: "studio",
    name: row.name,
    display_name: row.name,
    username: row.slug == null ? "" : String(row.slug),
    slug: row.slug == null ? "" : String(row.slug),
    avatar: rewriteStorageUrl(row.logo_url) || null,
    logo_url: rewriteStorageUrl(row.logo_url) || null,
    status: row.status || "pending",
    moderator_id: row.moderator_id || null,
    moderator: row.moderator || null,
    rates,
    rate_tiers: ratesToTiers(rates),
    starts_from: startsFromPrice(rates),
    platform_commission_bps:
      row.platform_commission_bps == null ? null : Number(row.platform_commission_bps),
    employee_commission_bps:
      row.employee_commission_bps == null ? null : Number(row.employee_commission_bps),
    accepting_orders: Boolean(row.accepting_orders),
    available_count: availableCount,
    has_capacity: Boolean(row.accepting_orders) && availableCount > 0,
    avg_rating: Number(row.avg_rating) || 0,
    total_reviews: Number(row.reviews_count) || 0,
    reviews_count: Number(row.reviews_count) || 0,
    completed_projects: Number(row.completed_orders) || 0,
    completed_orders: Number(row.completed_orders) || 0,
    payout_method: row.payout_method || null,
    payout_details: row.payout_details || null,
    portfolio,
    specialties: [],
    styles: [],
    build_types: [],
    rank: null,
    bio: "",
    availability_status: availableCount > 0 ? "available" : "busy",
    member_since: row.claimed_at || row.created_at || null,
  };
}

function clientError() {
  return new Error("Supabase not configured");
}

// ─── Public storefront/catalog ──────────────────────────────────────────────

const PUBLIC_SELECT =
  `${PUBLIC_STUDIO_COLUMNS}, ` +
  "portfolio:studio_portfolio_images(id, url, storage_path, position, alt)";

export async function fetchStudios() {
  const supabase = getSupabaseClient();
  if (!supabase) return { studios: [], error: null };
  const { data, error } = await supabase
    .from("studios")
    .select(PUBLIC_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) return { studios: [], error };

  return {
    studios: (data || []).map(mapStudioRow),
    error: null,
  };
}

export async function fetchStudio(slug) {
  const supabase = getSupabaseClient();
  if (!supabase || !slug) return { studio: null, error: null };
  const { data, error } = await supabase
    .from("studios")
    .select(`${PUBLIC_STUDIO_COLUMNS}, portfolio:studio_portfolio_images(id, url, storage_path, position, alt)`)
    .eq("slug", slug)
    .maybeSingle();
  if (error) return { studio: null, error };
  if (!data) return { studio: null, error: null };

  return { studio: mapStudioRow(data), error: null };
}

export async function fetchStudioReviews(studioId) {
  const supabase = getSupabaseClient();
  if (!supabase || !studioId) return { reviews: [], error: null };
  const { data, error } = await supabase
    .from("reviews")
    .select("id, order_id, rating, body, created_at, reviewer:reviewer_id(id, username, display_name, avatar_url)")
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false });
  return { reviews: error ? [] : rewriteUrlsDeep(data || []), error: error || null };
}

export async function getOrCreateStudioConversation(studioId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { conversationId: null, error: clientError() };
  const { data, error } = await supabase.rpc("get_or_create_studio_conversation", {
    p_studio: studioId,
  });
  return { conversationId: data || null, error: error || null };
}

// ─── Moderator and employee onboarding ──────────────────────────────────────

export async function validateModeratorCode(code) {
  const supabase = getSupabaseClient();
  if (!supabase) return { valid: false, error: clientError() };
  const { data, error } = await supabase.rpc("validate_studio_moderator_invite", {
    p_code: code,
  });
  return { valid: Boolean(data?.valid), error: error || null };
}

export async function completeStudioRegistration({
  code,
  name,
  username,
  avatarUrl,
  rates,
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { studioId: null, error: clientError() };
  const { data, error } = await supabase.rpc("complete_studio_registration", {
    p_code: code,
    p_name: name,
    p_username: username,
    p_avatar_url: avatarUrl || null,
    p_rates: rates,
  });
  return { studioId: data || null, error: error || null };
}

export async function validateEmployeeCode(code) {
  const supabase = getSupabaseClient();
  if (!supabase) return { studio: null, error: clientError() };
  const { data, error } = await supabase.rpc("validate_studio_employee_code", {
    p_code: code,
  });
  return { studio: data || null, error: error || null };
}

export async function completeEmployeeRegistration({
  code,
  displayName,
  username,
  avatarUrl,
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { membershipId: null, error: clientError() };
  const { data, error } = await supabase.rpc("complete_studio_employee_registration", {
    p_code: code,
    p_display_name: displayName,
    p_username: username,
    p_avatar_url: avatarUrl || null,
  });
  return { membershipId: data || null, error: error || null };
}

// Legacy import aliases while all onboarding routes move to the new split flow.
export const validateStudioCode = validateEmployeeCode;
export async function finalizeStudioCode() {
  return { studio: null, error: null };
}

// ─── BuildEx admin ──────────────────────────────────────────────────────────

export async function listModeratorInvites() {
  const supabase = getSupabaseClient();
  if (!supabase) return { invites: [], error: null };
  const { data, error } = await supabase
    .from("studio_moderator_invites")
    .select("id, internal_name, code, status, claimed_by, studio_id, created_at, claimed_at")
    .order("created_at", { ascending: false });
  return { invites: error ? [] : data || [], error: error || null };
}

export async function createModeratorInvite({ internalName, code }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { id: null, error: clientError() };
  const { data, error } = await supabase.rpc("admin_create_studio_moderator_invite", {
    p_internal_name: internalName,
    p_code: code,
  });
  return { id: data || null, error: error || null };
}

export async function setModeratorInviteStatus(id, status) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: clientError() };
  const { error } = await supabase.rpc("admin_set_studio_moderator_invite_status", {
    p_invite: id,
    p_status: status,
  });
  return { error: error || null };
}

export async function listStudios() {
  const supabase = getSupabaseClient();
  if (!supabase) return { studios: [], error: null };
  const [{ data, error }, { data: balances, error: balanceError }] = await Promise.all([
    supabase.rpc("admin_list_managed_studios"),
    supabase.rpc("admin_list_studio_balances"),
  ]);
  const balanceByStudio = new Map((balances || []).map((row) => [row.studio_id, row]));
  return {
    studios: error
      ? []
      : (data || []).map((row) => ({
          ...mapStudioRow(row),
          balance: balanceByStudio.get(row.id) || null,
        })),
    error: error || balanceError || null,
  };
}

export async function configureManagedStudio({ id, platformCommissionBps, status }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: clientError() };
  const { error } = await supabase.rpc("admin_configure_managed_studio", {
    p_studio: id,
    p_platform_commission_bps: platformCommissionBps,
    p_status: status,
  });
  return { error: error || null };
}

export async function recoverManagedStudioOwner(studioId, newModeratorId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: clientError() };
  const { error } = await supabase.rpc("admin_recover_studio_owner", {
    p_studio: studioId,
    p_new_moderator: newModeratorId,
  });
  return { error: error || null };
}

// ─── Studio moderator dashboard ─────────────────────────────────────────────

export async function fetchMyStudio() {
  const supabase = getSupabaseClient();
  if (!supabase) return { studio: null, error: null };
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return { studio: null, error: null };
  const { data, error } = await supabase.rpc("get_my_managed_studio");
  return { studio: error ? null : mapStudioRow(data), error: error || null };
}

export async function updateMyStudio({
  name,
  username,
  avatarUrl,
  rates,
  employeeCommissionBps,
  acceptingOrders,
  payoutMethod,
  payoutDetails,
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: clientError() };
  const { error } = await supabase.rpc("update_my_studio", {
    p_name: name,
    p_username: username,
    p_avatar_url: avatarUrl || null,
    p_rates: rates,
    p_employee_commission_bps: employeeCommissionBps,
    p_accepting_orders: Boolean(acceptingOrders),
    p_payout_method: payoutMethod || null,
    p_payout_details: payoutDetails || null,
  });
  return { error: error || null };
}

export async function addStudioPortfolioImage(studioId, file, position = 0) {
  const supabase = getSupabaseClient();
  if (!supabase) return { image: null, error: clientError() };
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return { image: null, error: new Error("Not authenticated") };
  const uploaded = await uploadPortfolioImage(supabase, userId, file);
  if (uploaded.error || !uploaded.url) {
    return { image: null, error: uploaded.error || new Error("Upload failed") };
  }
  const { data, error } = await supabase
    .from("studio_portfolio_images")
    .insert({
      studio_id: studioId,
      url: uploaded.url,
      storage_path: uploaded.path,
      position,
      alt: file.name.replace(/\.[a-z0-9]+$/i, ""),
    })
    .select("id, url, storage_path, position, alt")
    .single();
  return { image: data || null, error: error || null };
}

export async function deleteStudioPortfolioImage(image) {
  const supabase = getSupabaseClient();
  if (!supabase || !image?.id) return { error: clientError() };
  const { error } = await supabase
    .from("studio_portfolio_images")
    .delete()
    .eq("id", image.id);
  if (!error && image.storage_path) {
    await supabase.storage.from("portfolios").remove([image.storage_path]);
  }
  return { error: error || null };
}

export async function listStudioMembers(studioId) {
  const supabase = getSupabaseClient();
  if (!supabase || !studioId) return { members: [], error: null };
  const { data, error } = await supabase
    .from("studio_memberships")
    .select("id, studio_id, builder_id, status, availability_status, busy_source, joined_at, removed_at, builder:builder_id(id, username, display_name, avatar_url)")
    .eq("studio_id", studioId)
    .order("joined_at", { ascending: false });
  return { members: error ? [] : rewriteUrlsDeep(data || []), error: error || null };
}

export async function listEmployeeCodes(studioId) {
  const supabase = getSupabaseClient();
  if (!supabase || !studioId) return { codes: [], error: null };
  const { data, error } = await supabase
    .from("studio_employee_codes")
    .select("id, studio_id, code, max_redemptions, redemptions_used, expires_at, status, created_at")
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false });
  return { codes: error ? [] : data || [], error: error || null };
}

export async function createEmployeeCode({ code, maxRedemptions, expiresAt }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { id: null, error: clientError() };
  const { data, error } = await supabase.rpc("create_studio_employee_code", {
    p_code: code,
    p_max_redemptions: maxRedemptions,
    p_expires_at: expiresAt || null,
  });
  return { id: data || null, error: error || null };
}

export async function setEmployeeCodeStatus(id, status) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: clientError() };
  const { error } = await supabase.rpc("set_studio_employee_code_status", {
    p_code_id: id,
    p_status: status,
  });
  return { error: error || null };
}

export async function removeStudioEmployee(builderId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: clientError() };
  const { error } = await supabase.rpc("remove_studio_employee", {
    p_builder: builderId,
  });
  return { error: error || null };
}

export async function setMyEmployeeAvailability(status) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: clientError() };
  const { error } = await supabase.rpc("set_my_studio_availability", {
    p_status: status,
  });
  return { error: error || null };
}

export async function listMyEmployeeEarnings() {
  const supabase = getSupabaseClient();
  if (!supabase) return { earnings: [], error: null };
  const { data, error } = await supabase
    .from("studio_employee_earnings")
    .select("id, order_id, studio_id, commission_bps, amount_kopecks, created_at, studio:studio_id(id, name, slug)")
    .order("created_at", { ascending: false });
  return { earnings: error ? [] : data || [], error: error || null };
}

export async function listStudioEmployeeEarnings(studioId) {
  const supabase = getSupabaseClient();
  if (!supabase || !studioId) return { earnings: [], error: null };
  const { data, error } = await supabase
    .from("studio_employee_earnings")
    .select("id, order_id, builder_id, commission_bps, amount_kopecks, created_at")
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false });
  return { earnings: error ? [] : data || [], error: error || null };
}

export async function getStudioBalance() {
  const supabase = getSupabaseClient();
  if (!supabase) return { summary: null, error: clientError() };
  const { data, error } = await supabase.rpc("get_my_studio_payout_summary");
  return { summary: data || null, error: error || null };
}

export async function requestStudioWithdrawal(amountCents) {
  const supabase = getSupabaseClient();
  if (!supabase) return { payoutId: null, error: clientError() };
  const { data, error } = await supabase.rpc("request_studio_withdrawal", {
    p_amount_cents: amountCents,
  });
  return { payoutId: data || null, error: error || null };
}

export async function cancelStudioWithdrawal(payoutId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: clientError() };
  const { error } = await supabase.rpc("cancel_studio_withdrawal", {
    p_payout: payoutId,
  });
  return { error: error || null };
}

export async function assignStudioOrder(orderId, builderId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: clientError() };
  const { error } = await supabase.rpc("assign_studio_order", {
    p_order: orderId,
    p_builder: builderId,
  });
  return { error: error || null };
}

// Removed referral-era exports retained as explicit no-ops for any stale import.
export async function fetchStudioBuilders() {
  return { builders: [], error: null };
}
export async function listStudioCodes() {
  return { codes: [], error: null };
}
export async function listStudioOverrides() {
  return { overrides: [], error: null };
}
export async function createStudio() {
  return { id: null, error: new Error("Use moderator invitations for managed studios") };
}
export async function updateStudio() {
  return { error: new Error("Managed studios edit their own storefront") };
}
export async function setStudioStatus({ id, status }) {
  return configureManagedStudio({ id, status, platformCommissionBps: 0 });
}
export async function createStudioCode() {
  return { id: null, error: new Error("Use employee code batches") };
}
export async function setCodeStatus() {
  return { error: new Error("Use employee code batches") };
}
export async function markOverridePaid() {
  return { error: new Error("Studio overrides were retired") };
}
