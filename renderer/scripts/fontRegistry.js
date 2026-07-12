const fs = require("fs");
const path = require("path");

const FONT_DIRS = [
  "/System/Library/Fonts",
  "/System/Library/Fonts/Supplemental",
  "/Library/Fonts",
];

const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc"]);

const FONT_REGISTRY = {
  sf_pro_display: [
    "SF Pro Display",
    "SF-Pro-Display-Semibold",
    "SF-Pro-Display-Regular",
    "SFNSDisplay",
  ],
  helvetica_neue: ["Helvetica Neue", "HelveticaNeue", "HelveticaNeue-Medium"],
  montserrat: ["Montserrat", "Montserrat Bold", "Montserrat-SemiBold", "Montserrat-Regular"],
  be_vietnam_pro: ["Be Vietnam Pro", "BeVietnamPro", "Be Vietnam"],
  arial_unicode: ["Arial Unicode", "Arial Unicode.ttf", "Arial Unicode MS"],
  noto_sans: ["Noto Sans", "NotoSans-Regular", "NotoSans"],
};

const FALLBACK_FONTS = [
  "SF Pro Display",
  "Helvetica Neue",
  "Arial Unicode",
  "Noto Sans",
  "Arial",
];

let fontCache = null;

function normalizeFontKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function collectFonts() {
  if (fontCache) return fontCache;

  const fonts = [];
  const visited = new Set();

  for (const dir of FONT_DIRS) {
    walkFontDir(dir, fonts, visited);
  }

  fontCache = fonts;
  return fontCache;
}

function walkFontDir(dir, fonts, visited) {
  if (!fs.existsSync(dir) || visited.has(dir)) return;
  visited.add(dir);

  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFontDir(fullPath, fonts, visited);
      continue;
    }

    if (!FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

    fonts.push({
      name: path.basename(entry.name, path.extname(entry.name)),
      path: fullPath,
      key: normalizeFontKey(entry.name),
    });
  }
}

function expandFontCandidates(requestedFont) {
  const candidates = [];
  if (requestedFont) candidates.push(requestedFont);

  const registryKey = normalizeFontKey(requestedFont);
  for (const [key, values] of Object.entries(FONT_REGISTRY)) {
    if (normalizeFontKey(key) === registryKey || values.some((value) => normalizeFontKey(value) === registryKey)) {
      candidates.push(...values);
    }
  }

  candidates.push(...FALLBACK_FONTS);
  return [...new Set(candidates.filter(Boolean))];
}

function resolveFont(requestedFont) {
  const fonts = collectFonts();
  const candidates = expandFontCandidates(requestedFont);

  for (const candidate of candidates) {
    const candidateKey = normalizeFontKey(candidate);
    const exact = fonts.find((font) => font.key === candidateKey || normalizeFontKey(font.name) === candidateKey);
    if (exact) {
      return {
        family: candidate,
        path: exact.path,
        source: "exact",
        fallback: candidate !== requestedFont,
      };
    }

    const partial = fonts.find((font) => font.key.includes(candidateKey));
    if (partial) {
      return {
        family: candidate,
        path: partial.path,
        source: "partial",
        fallback: candidate !== requestedFont,
      };
    }
  }

  return {
    family: "Arial Unicode",
    path: "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    source: "hard_fallback",
    fallback: true,
  };
}

module.exports = {
  resolveFont,
};
