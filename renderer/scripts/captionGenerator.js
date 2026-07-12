function buildPostText(timeline) {
  const meta = timeline.video_meta || timeline.videoMeta || {};
  const title = String(meta.title || "").trim();
  const description = String(meta.description || "").trim();
  const hashtags = normalizeHashtags(meta.hashtags);

  return `${title}\n\n${description}\n\n${hashtags}\n`;
}

function normalizeHashtags(value) {
  const tags = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/\s+/)
        .filter(Boolean);

  return tags
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");
}

module.exports = {
  buildPostText,
  normalizeHashtags,
};
