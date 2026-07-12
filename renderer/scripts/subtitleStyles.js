function normalizeStyleKey(value) {
  if (!value) return "none";
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const subtitleStyleRegistry = {
  editorial_premium: {
    displayName: "editorial_premium",
    font: "SF Pro Display",
    fontsize: 76,
    fontcolor: "0xE85A3A",
    borderw: "3",
    bordercolor: "0xFFF3C7",
    shadowx: "0",
    shadowy: "2",
    shadowcolor: "0x215F59@0.48",
    box: false,
    boxcolor: "black@0.0",
    boxborderw: "0",
    lineSpacingScale: 0.92,
    maxLines: 3,
    animation: "poster_lift",
    layers: [
      {
        name: "warm_depth",
        fontcolor: "0xF0D85C",
        borderw: "5",
        bordercolor: "0xF0D85C@0.96",
        shadowx: "0",
        shadowy: "0",
        shadowcolor: "black@0.0",
        yOffset: 8,
        box: "0",
      },
      {
        name: "teal_stroke",
        fontcolor: "0xFFF4C7",
        borderw: "5",
        bordercolor: "0x2D837B@0.92",
        shadowx: "0",
        shadowy: "0",
        shadowcolor: "black@0.0",
        yOffset: 2,
        box: "0",
      },
      {
        name: "main_fill",
        fontcolor: "0xE85A3A",
        borderw: "2",
        bordercolor: "0xFFF6D6@0.96",
        shadowx: "0",
        shadowy: "2",
        shadowcolor: "0x183F3B@0.38",
        box: "0",
      },
    ],
  },

  clean_modern: {
    displayName: "clean_modern",
    font: "SF Pro Display",
    fontsize: 66,
    fontcolor: "0xFFFDF6",
    borderw: "3",
    bordercolor: "0x14264B@0.92",
    shadowx: "0",
    shadowy: "4",
    shadowcolor: "0x000000@0.46",
    box: false,
    boxcolor: "black@0.0",
    boxborderw: "0",
    lineSpacingScale: 1.04,
    maxLines: 2,
    animation: "card_settle",
  },

  premium_hook: {
    displayName: "premium_hook",
    font: "SF Pro Display",
    fontsize: 86,
    fontcolor: "0xE85A3A",
    borderw: "3",
    bordercolor: "0xFFF3C7",
    shadowx: "0",
    shadowy: "2",
    shadowcolor: "0x215F59@0.48",
    box: false,
    boxcolor: "black@0.0",
    boxborderw: "0",
    lineSpacingScale: 0.86,
    maxLines: 3,
    animation: "poster_lift",
    layers: [
      {
        name: "gold_drop",
        fontcolor: "0xF1D84E",
        borderw: "6",
        bordercolor: "0xF1D84E@0.98",
        shadowx: "0",
        shadowy: "0",
        shadowcolor: "black@0.0",
        yOffset: 9,
        box: "0",
      },
      {
        name: "teal_rim",
        fontcolor: "0xFFF1BF",
        borderw: "6",
        bordercolor: "0x2E837A@0.94",
        shadowx: "0",
        shadowy: "0",
        shadowcolor: "black@0.0",
        yOffset: 3,
        box: "0",
      },
      {
        name: "coral_face",
        fontcolor: "0xE85A3A",
        borderw: "2",
        bordercolor: "0xFFF7D8@1.0",
        shadowx: "0",
        shadowy: "2",
        shadowcolor: "0x143E39@0.36",
        box: "0",
      },
    ],
  },

  minimal_cta: {
    displayName: "minimal_cta",
    font: "SF Pro Display",
    fontsize: 72,
    fontcolor: "0xFFFDF6",
    borderw: "3",
    bordercolor: "0x14264B@0.94",
    shadowx: "0",
    shadowy: "5",
    shadowcolor: "0x000000@0.48",
    box: false,
    boxcolor: "black@0.0",
    boxborderw: "0",
    lineSpacingScale: 1.02,
    maxLines: 2,
    animation: "card_settle",
  },

  framed_card: {
    displayName: "framed_card",
    font: "SF Pro Display",
    fontsize: 76,
    fontcolor: "0x112D5B",
    borderw: "1",
    bordercolor: "0x112D5B@0.42",
    shadowx: "0",
    shadowy: "2",
    shadowcolor: "0x000000@0.18",
    box: true,
    boxcolor: "0xFFFDF6@0.96",
    boxborderw: "22",
    lineSpacingScale: 0.96,
    maxLines: 2,
    animation: "card_settle",
    layers: [
      {
        name: "red_top_edge",
        fontcolor: "0xFFFFFF@0.0",
        borderw: "0",
        bordercolor: "0xFFFFFF@0.0",
        shadowx: "0",
        shadowy: "0",
        shadowcolor: "0x000000@0.0",
        xOffset: -10,
        yOffset: -8,
        box: "1",
        boxcolor: "0xEA4A2A@0.92",
        boxborderw: "22",
      },
      {
        name: "teal_left_edge",
        fontcolor: "0xFFFFFF@0.0",
        borderw: "0",
        bordercolor: "0xFFFFFF@0.0",
        shadowx: "0",
        shadowy: "0",
        shadowcolor: "0x000000@0.0",
        xOffset: -10,
        yOffset: 8,
        box: "1",
        boxcolor: "0x32B9A7@0.92",
        boxborderw: "22",
      },
      {
        name: "yellow_bottom_edge",
        fontcolor: "0xFFFFFF@0.0",
        borderw: "0",
        bordercolor: "0xFFFFFF@0.0",
        shadowx: "0",
        shadowy: "0",
        shadowcolor: "0x000000@0.0",
        xOffset: 10,
        yOffset: 8,
        box: "1",
        boxcolor: "0xF6C431@0.94",
        boxborderw: "22",
      },
      {
        name: "white_card",
        fontcolor: "0x112D5B",
        borderw: "1",
        bordercolor: "0x112D5B@0.50",
        shadowx: "0",
        shadowy: "2",
        shadowcolor: "0x000000@0.16",
        box: "1",
        boxcolor: "0xFFFDF6@0.98",
        boxborderw: "18",
      },
    ],
  },

  gold_caption: {
    displayName: "gold_caption",
    font: "SF Pro Display",
    fontsize: 82,
    fontcolor: "0xF2C43A",
    borderw: "2",
    bordercolor: "0x4B2F10@0.92",
    shadowx: "0",
    shadowy: "4",
    shadowcolor: "0x000000@0.52",
    box: false,
    boxcolor: "black@0.0",
    boxborderw: "0",
    lineSpacingScale: 0.92,
    maxLines: 2,
    animation: "poster_lift",
    layers: [
      {
        name: "dark_depth",
        fontcolor: "0x4B2F10",
        borderw: "4",
        bordercolor: "0x201307@0.70",
        shadowx: "0",
        shadowy: "0",
        shadowcolor: "black@0.0",
        yOffset: 5,
        box: "0",
      },
      {
        name: "warm_highlight",
        fontcolor: "0xFFF2A8",
        borderw: "3",
        bordercolor: "0x5D3B13@0.82",
        shadowx: "0",
        shadowy: "0",
        shadowcolor: "black@0.0",
        yOffset: 1,
        box: "0",
      },
      {
        name: "gold_face",
        fontcolor: "0xF2C43A",
        borderw: "2",
        bordercolor: "0x3A250C@0.94",
        shadowx: "0",
        shadowy: "3",
        shadowcolor: "0x000000@0.40",
        box: "0",
      },
    ],
  },

  clean_white: {
    alias: "clean_modern",
  },

  hook_bold: {
    alias: "premium_hook",
  },

  neon_glow: {
    displayName: "neon_glow",
    font: "SF Pro Display",
    fontsize: 78,
    fontcolor: "0xF36545",
    borderw: "3",
    bordercolor: "0xFFF6D0@0.94",
    shadowx: "0",
    shadowy: "2",
    shadowcolor: "0x2E837A@0.36",
    box: false,
    boxcolor: "black@0.0",
    boxborderw: "0",
    lineSpacingScale: 0.9,
    maxLines: 3,
    animation: "luminous_fade",
    layers: [
      {
        name: "soft_gold",
        fontcolor: "0xEFD85A",
        borderw: "5",
        bordercolor: "0xEFD85A@0.86",
        shadowx: "0",
        shadowy: "0",
        shadowcolor: "black@0.0",
        yOffset: 7,
        box: "0",
      },
      {
        name: "quiet_teal",
        fontcolor: "0xFFF7D8",
        borderw: "4",
        bordercolor: "0x3C9188@0.72",
        shadowx: "0",
        shadowy: "0",
        shadowcolor: "black@0.0",
        yOffset: 2,
        box: "0",
      },
      {
        name: "warm_face",
        fontcolor: "0xF36545",
        borderw: "2",
        bordercolor: "0xFFF8DE@0.96",
        shadowx: "0",
        shadowy: "2",
        shadowcolor: "0x153F3B@0.30",
        box: "0",
      },
    ],
  },

  cta_red: {
    alias: "minimal_cta",
  },

  tiktok_yellow: {
    alias: "premium_hook",
  },

  bold_red: {
    alias: "minimal_cta",
  },

  color_frame: {
    alias: "framed_card",
  },

  note_card: {
    alias: "framed_card",
  },

  gold_shadow: {
    alias: "gold_caption",
  },

  title_gold: {
    alias: "gold_caption",
  },
};

const SCENE_TYPE_PRESETS = {
  hook: ["premium_hook"],
  cta: ["minimal_cta"],
  cta_end: ["minimal_cta"],
  demo: ["clean_modern"],
  demo_main: ["clean_modern"],
  intro: ["clean_modern"],
  usp_short: ["neon_glow"],
};

function pickDeterministic(items, seed) {
  if (!items.length) return null;

  const text = String(seed || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return items[hash % items.length];
}

function getStyleName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.name === "string") return value.name;
  if (typeof value === "object" && typeof value.preset === "string") return value.preset;
  return "";
}

function resolveSubtitleStyle(scene = {}, cue = {}, cueIndex = 0) {
  const explicit = getStyleName(cue.subtitle_style || cue.subtitleStyle || scene.subtitle_style || scene.subtitleStyle);
  let requestedKey = normalizeStyleKey(explicit);
  let source = explicit ? "explicit" : "scene_type";

  if (!requestedKey || !subtitleStyleRegistry[requestedKey]) {
    const sceneType = normalizeStyleKey(scene.scene_type || scene.sceneType);
    const candidates = SCENE_TYPE_PRESETS[sceneType] || ["editorial_premium"];
    requestedKey = pickDeterministic(candidates, `${scene.id}:${cueIndex}:${sceneType}`) || "editorial_premium";
  }

  let preset = resolvePreset(requestedKey);

  const fallback = Boolean(explicit) && !subtitleStyleRegistry[normalizeStyleKey(explicit)];

  if (fallback) {
    source = "fallback";
  }

  return {
    ...preset,
    key: preset.displayName,
    requestedName: explicit || preset.displayName,
    source,
    fallback,
  };
}

function resolvePreset(key) {
  let preset = subtitleStyleRegistry[key] || subtitleStyleRegistry.editorial_premium;
  const seen = new Set();

  while (preset && preset.alias && !seen.has(preset.alias)) {
    seen.add(preset.alias);
    preset = subtitleStyleRegistry[preset.alias] || subtitleStyleRegistry.editorial_premium;
  }

  return preset || subtitleStyleRegistry.editorial_premium;
}

module.exports = {
  resolveSubtitleStyle,
  subtitleStyleRegistry,
};
