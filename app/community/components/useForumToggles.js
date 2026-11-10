"use client";

// Optimistic "helpful" (a like, on a Showcase post) and save for an open topic
// or post and its replies, after lib/works/engagement's like: the state flips
// the moment it is clicked, the RPC confirms it, and on an error it flips back
// with a message. No reload of the whole thread for a toggle.
//
// `setData` holds { topic, replies } (TopicView / PostView); `showNotice`
// shows a toast.

import { useCallback } from "react";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { toggleHelpful, toggleTopicSave } from "../../../lib/community/api";

export function useForumToggles(setData, showNotice) {
  const patchTopic = useCallback(
    (fields) => setData((d) => (d && d.topic ? { ...d, topic: { ...d.topic, ...fields } } : d)),
    [setData]
  );
  const patchReply = useCallback(
    (id, fields) => setData((d) => (d && d.replies ? { ...d, replies: d.replies.map((r) => (r.id === id ? { ...r, ...fields } : r)) } : d)),
    [setData]
  );

  // The count after the server's answer: what it was, minus the old mark,
  // plus the new one (the server's state wins over the optimistic guess).
  const settle = (prev, on) => Math.max(0, prev.helpful_count - (prev.helpful_by_me ? 1 : 0) + (on ? 1 : 0));

  const flip = useCallback(
    async (type, item, patch) => {
      const prev = { helpful_by_me: Boolean(item.helpful_by_me), helpful_count: item.helpful_count || 0 };
      patch({ helpful_by_me: !prev.helpful_by_me, helpful_count: settle(prev, !prev.helpful_by_me) });
      const { on, error } = await toggleHelpful(type, item.id);
      if (error) {
        patch(prev);
        showNotice(serverMessage(error, "community.errors.failed"));
        return;
      }
      patch({ helpful_by_me: Boolean(on), helpful_count: settle(prev, Boolean(on)) });
    },
    [showNotice]
  );

  const toggleTopicHelpful = useCallback((topic) => flip("topic", topic, patchTopic), [flip, patchTopic]);
  const toggleReplyHelpful = useCallback((reply) => flip("reply", reply, (f) => patchReply(reply.id, f)), [flip, patchReply]);

  // Returns { ok } so SaveButton can undo its own flip on a failure.
  const toggleSave = useCallback(
    async (topic) => {
      const was = Boolean(topic.saved_by_me);
      patchTopic({ saved_by_me: !was });
      const { saved, error } = await toggleTopicSave(topic.id);
      if (error) {
        patchTopic({ saved_by_me: was });
        showNotice(serverMessage(error, "community.errors.failed"));
        return { ok: false };
      }
      patchTopic({ saved_by_me: Boolean(saved) });
      return { ok: true };
    },
    [patchTopic, showNotice]
  );

  return { toggleTopicHelpful, toggleReplyHelpful, toggleSave };
}
