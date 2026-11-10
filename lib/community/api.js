"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Community data layer (migration 0116)
// Showcase (every public work), saved works, the "Looking for a builder"
// board of public briefs, responses, and reports on public content. The
// board and the showcase are readable by guests; everything else needs a
// signed-in user. Every function resolves to { …, error } instead of throwing.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";
import { rewriteUrlsDeep, rewriteStorageUrl } from "../supabase/storageUrl";
import { compressImage, IMAGE_PRESETS } from "../images/compress";
import { BUCKETS } from "../onboarding/constants";

const NOT_CONFIGURED = new Error("Supabase not configured");

export const SHOWCASE_PAGE = 24;
export const REQUESTS_PAGE = 30;

function mapWorkRow(r) {
  return {
    id: r.work_id,
    title: r.title || "",
    cover: rewriteStorageUrl(r.cover_url) || null,
    photos: r.photos || 0,
    likes: r.likes || 0,
    createdAt: r.created_at,
    liked: Boolean(r.liked),
    saved: Boolean(r.saved),
    builder: {
      id: r.builder_id,
      username: r.username,
      displayName: r.display_name || r.username,
      avatarUrl: rewriteStorageUrl(r.avatar_url) || null,
    },
  };
}

// sort: 'new' | 'popular'; style: a style key or null. Returns { works, error }.
export async function fetchShowcase({ sort = "new", style = null, offset = 0 } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { works: [], error: null };
  const { data, error } = await supabase.rpc("list_showcase", {
    p_sort: sort,
    p_style: style,
    p_limit: SHOWCASE_PAGE,
    p_offset: offset,
  });
  if (error) return { works: [], error };
  return { works: (data || []).map(mapWorkRow), error: null };
}

export async function fetchSavedWorks() {
  const supabase = getSupabaseClient();
  if (!supabase) return { works: [], error: null };
  const { data, error } = await supabase.rpc("list_saved_works", { p_limit: 200, p_offset: 0 });
  if (error) return { works: [], error };
  return { works: (data || []).map(mapWorkRow), error: null };
}

// Returns { saved, error }.
export async function toggleWorkSave(workId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { saved: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc("toggle_work_save", { p_work: workId });
  if (error) return { saved: null, error };
  return { saved: Boolean(data), error: null };
}

// ─── "Looking for a builder" ─────────────────────────────────────────────────

// status: 'open' | 'all'; mine: only the caller's. Returns { briefs, error }.
export async function fetchPublicBriefs({ status = "open", type = null, mine = false, offset = 0 } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { briefs: [], error: null };
  const { data, error } = await supabase.rpc("list_public_briefs", {
    p_status: status,
    p_type: type,
    p_mine: mine,
    p_limit: REQUESTS_PAGE,
    p_offset: offset,
  });
  if (error) return { briefs: [], error };
  return { briefs: rewriteUrlsDeep(data || []), error: null };
}

// Returns { briefId, error }.
export async function publishBrief(payload) {
  const supabase = getSupabaseClient();
  if (!supabase) return { briefId: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc("publish_brief", { p_brief: payload });
  return { briefId: data || null, error: error || null };
}

export async function closePublicBrief(briefId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: NOT_CONFIGURED };
  const { error } = await supabase.rpc("close_public_brief", { p_brief: briefId });
  return { error: error || null };
}

// A builder responds. Returns { conversationId, error }.
export async function respondToBrief(briefId, message, workIds = []) {
  const supabase = getSupabaseClient();
  if (!supabase) return { conversationId: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc("respond_to_brief", {
    p_brief: briefId,
    p_message: message,
    p_work_ids: workIds,
  });
  return { conversationId: data || null, error: error || null };
}

// ─── Reports and moderation ──────────────────────────────────────────────────

// type: 'brief' | 'work'. Returns { error }.
export async function reportContent(type, id, reason) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: NOT_CONFIGURED };
  const { error } = await supabase.rpc("report_content", { p_type: type, p_id: id, p_reason: reason });
  return { error: error || null };
}

export async function setBriefHidden(briefId, hidden) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: NOT_CONFIGURED };
  const { error } = await supabase.rpc("admin_set_brief_hidden", { p_brief: briefId, p_hidden: Boolean(hidden) });
  return { error: error || null };
}

export async function listCommunityReports(status = "open") {
  const supabase = getSupabaseClient();
  if (!supabase) return { reports: [], error: null };
  const { data, error } = await supabase.rpc("admin_list_community_reports", { p_status: status });
  if (error) return { reports: [], error };
  return { reports: data || [], error: null };
}

export async function resolveCommunityReport(reportId, status) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: NOT_CONFIGURED };
  const { error } = await supabase.rpc("admin_resolve_community_report", { p_report: reportId, p_status: status });
  return { error: error || null };
}

// ─── Discussions (migration 0117) ────────────────────────────────────────────

export const TOPIC_KINDS = ["question", "guide", "idea"];
export const TOPICS_PAGE = 30;

// kind: null | 'question' | 'guide' | 'idea'; sort: 'active' | 'new' | 'top';
// scope: 'all' | 'mine' | 'saved'. Returns { topics, error }.
export async function fetchTopics({ kind = null, sort = "active", scope = "all", offset = 0 } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { topics: [], error: null };
  const { data, error } = await supabase.rpc("list_forum_topics", {
    p_kind: kind,
    p_sort: sort,
    p_scope: scope,
    p_limit: TOPICS_PAGE,
    p_offset: offset,
  });
  if (error) return { topics: [], error };
  return { topics: rewriteUrlsDeep(data || []), error: null };
}

// Returns { topic, replies, error }; topic is null when it is not available.
export async function fetchTopic(topicId) {
  const supabase = getSupabaseClient();
  if (!supabase || !topicId) return { topic: null, replies: [], error: null };
  const { data, error } = await supabase.rpc("get_forum_topic", { p_topic: topicId });
  if (error) return { topic: null, replies: [], error };
  const out = rewriteUrlsDeep(data || {});
  return { topic: out.topic || null, replies: out.replies || [], error: null };
}

async function call(name, args) {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc(name, args);
  return { data: data ?? null, error: error || null };
}

export async function createTopic(kind, title, body) {
  const { data, error } = await call("create_forum_topic", { p_kind: kind, p_title: title, p_body: body });
  return { topicId: data, error };
}

export async function editTopic(topicId, title, body) {
  const { error } = await call("edit_forum_topic", { p_topic: topicId, p_title: title, p_body: body });
  return { error };
}

export async function replyToTopic(topicId, body, quoteId = null) {
  const { data, error } = await call("reply_to_forum_topic", { p_topic: topicId, p_body: body, p_quote: quoteId });
  return { replyId: data, error };
}

export async function editReply(replyId, body) {
  const { error } = await call("edit_forum_reply", { p_reply: replyId, p_body: body });
  return { error };
}

export async function toggleHelpful(type, id) {
  const { data, error } = await call("toggle_forum_helpful", { p_type: type, p_id: id });
  return { on: data, error };
}

export async function toggleTopicSave(topicId) {
  const { data, error } = await call("toggle_forum_save", { p_topic: topicId });
  return { saved: data, error };
}

export async function markSolved(topicId, replyId) {
  const { error } = await call("mark_forum_solved", { p_topic: topicId, p_reply: replyId });
  return { error };
}

export async function setForumHidden(type, id, hidden) {
  const { error } = await call("admin_set_forum_hidden", { p_type: type, p_id: id, p_hidden: Boolean(hidden) });
  return { error };
}

export async function setTopicPinned(topicId, pinned) {
  const { error } = await call("admin_set_forum_pinned", { p_topic: topicId, p_pinned: Boolean(pinned) });
  return { error };
}


// ─── Showcase posts (migration 0118) ─────────────────────────────────────────
// A post is a forum topic of kind 'showcase' with 1–10 photos in the public
// bucket community-media (path <uid>/<uuid>.<ext>) and optional styles.
// Replies, helpful (= like), saves, reports and moderation are the forum's.

export const POSTS_PAGE = 24;
export const POST_MAX_IMAGES = 10;
export const POST_CAPTION_MAX = 2000;
export const POST_MAX_STYLES = 5;
// A photo is compressed in the browser first; this is the ceiling on what is
// sent, so a failed compression of a huge original is refused, not uploaded.
export const POST_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

const POST_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpe?g|png)$/i;

// The public address of a post photo, built from its path in the bucket.
export function communityImageUrl(path) {
  if (typeof path !== "string" || !POST_PATH.test(path)) return null;
  const supabase = getSupabaseClient();
  const url = supabase?.storage.from(BUCKETS.communityMedia).getPublicUrl(path)?.data?.publicUrl;
  return rewriteStorageUrl(url) || null;
}

function mapPostRow(r) {
  const paths = Array.isArray(r.images) ? r.images.filter((p) => typeof p === "string") : [];
  return {
    id: r.id,
    caption: r.caption || "",
    images: paths.map((path) => ({ path, url: communityImageUrl(path) })),
    styles: Array.isArray(r.styles) ? r.styles : [],
    likes: r.helpful_count || 0,
    replies: r.reply_count || 0,
    createdAt: r.created_at,
    pinned: Boolean(r.pinned),
    hidden: Boolean(r.hidden),
    liked: Boolean(r.helpful_by_me),
    saved: Boolean(r.saved_by_me),
    author: {
      id: r.author_id,
      username: r.author_username,
      displayName: r.author_display_name || r.author_username,
      avatarUrl: rewriteStorageUrl(r.author_avatar_url) || null,
      isBuilder: Boolean(r.author_is_builder),
    },
  };
}

// sort: 'new' | 'popular'; style: a style key or null; scope: 'all' | 'saved'
// | 'mine'. Returns { posts, error }.
export async function fetchShowcasePosts({ sort = "new", style = null, scope = "all", offset = 0 } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { posts: [], error: null };
  const { data, error } = await supabase.rpc("list_showcase_posts", {
    p_sort: sort,
    p_style: style,
    p_scope: scope,
    p_limit: POSTS_PAGE,
    p_offset: offset,
  });
  if (error) return { posts: [], error };
  return { posts: (data || []).map(mapPostRow), error: null };
}

// Compress a photo in the browser and put it in the viewer's folder of the
// community-media bucket. Returns { path, error }.
export async function uploadPostImage(userId, file) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId || !file) return { path: null, error: NOT_CONFIGURED };
  const out = await compressImage(file, IMAGE_PRESETS.portfolio);
  if (!/^image\/(webp|jpeg|png)$/.test(out.type)) {
    return { path: null, error: new Error("Only JPEG, PNG and WebP photos can be posted.") };
  }
  if (out.size > POST_IMAGE_MAX_BYTES) {
    return { path: null, error: new Error("That photo is too large even after compression.") };
  }
  const ext = out.type === "image/webp" ? "webp" : out.type === "image/png" ? "png" : "jpg";
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null;
  if (!id) return { path: null, error: new Error("This browser cannot name the upload.") };
  const path = `${userId}/${id}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKETS.communityMedia)
    .upload(path, out, { cacheControl: "2592000", upsert: false, contentType: out.type });
  if (error) return { path: null, error };
  return { path, error: null };
}

// Returns { postId, error }.
export async function createShowcasePost(caption, paths, styles = []) {
  const { data, error } = await call("create_showcase_post", { p_caption: caption, p_images: paths, p_styles: styles });
  return { postId: data, error };
}

export async function editShowcasePost(postId, caption, styles = []) {
  const { error } = await call("edit_showcase_post", { p_topic: postId, p_caption: caption, p_styles: styles });
  return { error };
}

// The right column: { pinned, popular, active }. kind: the channel's topic
// kind, null for all discussions.
export async function fetchCommunityRail(kind = null) {
  const { data, error } = await call("community_rail", { p_kind: kind });
  if (error || !data) return { rail: { pinned: [], popular: [], active: [] }, error };
  const out = rewriteUrlsDeep(data);
  return { rail: { pinned: out.pinned || [], popular: out.popular || [], active: out.active || [] }, error: null };
}

export async function listAdminShowcasePosts() {
  const { data, error } = await call("admin_list_showcase_posts", { p_limit: 200 });
  if (error) return { posts: [], error };
  return {
    posts: (data || []).map((r) => ({
      id: r.id,
      caption: r.caption || "",
      cover: communityImageUrl(Array.isArray(r.images) ? r.images[0] : null),
      createdAt: r.created_at,
      hidden: Boolean(r.hidden),
      pinned: Boolean(r.pinned),
      replies: r.reply_count || 0,
      likes: r.helpful_count || 0,
      author: r.author_username,
    })),
    error: null,
  };
}
