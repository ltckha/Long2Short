function normalizePosition(value) {
  const key = String(value || "bottom").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (["top", "center", "bottom"].includes(key)) return key;
  return "bottom";
}

function getSubtitlePosition(position, subtitleSafeArea) {
  const key = normalizePosition(position);

  if (key === "top") {
    return {
      key,
      y: `h*${subtitleSafeArea.topRatio || 0.1}`,
    };
  }

  if (key === "center") {
    return {
      key,
      y: `(h-text_h)*${subtitleSafeArea.centerRatio || 0.46}`,
    };
  }

  return {
    key: "bottom",
    y: `h-(text_h+h*${subtitleSafeArea.bottomRatio || 0.13})`,
  };
}

module.exports = {
  getSubtitlePosition,
};
