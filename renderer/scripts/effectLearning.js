const fs = require("fs");
const path = require("path");

const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const EFFECTS_DIR = path.join(WORKSPACE_ROOT, "effects");
const LEARNED_EFFECTS_PATH = path.join(EFFECTS_DIR, "learned_effects.json");
const STATS_PATH = path.join(EFFECTS_DIR, "effect_success_stats.json");
const DEFAULT_SAFE_EFFECT = "zoom_soft";
const RECENT_LOG_LIMIT = 8;
const AUTO_ALIAS_THRESHOLD = 5;


const KEYWORD_MAPPINGS = [
  { keyword: "smooth", mapped: "zoom_soft" },
  { keyword: "transition", mapped: "zoom_soft" },
  { keyword: "dynamic", mapped: "shake" },
  { keyword: "viral", mapped: "speed_ramp_fast" },
  { keyword: "motion", mapped: "shake" },
  { keyword: "speed", mapped: "speed_ramp_fast" },
  { keyword: "fast", mapped: "speed_ramp_fast" },
  { keyword: "glow", mapped: "rgb_shift" },
  { keyword: "rgb", mapped: "rgb_shift" },
  { keyword: "glitch", mapped: "rgb_shift" },
  { keyword: "cinematic", mapped: "cinematic_zoom" },
  { keyword: "zoom", mapped: "zoom_soft" },
  { keyword: "shake", mapped: "shake" },
  { keyword: "flash", mapped: "flash" },
];

const SIMILAR_EFFECTS = [
  { name: "zoom in", mapped: "zoom_soft" },
  { name: "soft zoom", mapped: "zoom_soft" },
  { name: "smooth zoom", mapped: "zoom_soft" },
  { name: "shake", mapped: "shake" },
  { name: "speed ramp", mapped: "speed_ramp_fast" },
  { name: "glitch", mapped: "rgb_shift" },
  { name: "cinematic zoom", mapped: "cinematic_zoom" },
  { name: "flash", mapped: "flash" },
];

let learnedEffects = {};
let recentLogAnalysis = emptyLogAnalysis();

function normalizeLearningKey(value) {
  return String(value || "none")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "none";
}

function normalizeRegistryKey(value) {
  return String(value || "none").toLowerCase().replace(/[^a-z0-9]+/g, "") || "none";
}

function initializeEffectLearning(logDir, options = {}) {
  learnedEffects = loadLearnedEffects();
  recentLogAnalysis = analyzeRecentRenderLogs(logDir, options.limit || RECENT_LOG_LIMIT);
  learnFrequentFallbacksFromLogs();
  return recentLogAnalysis;
}

function loadLearnedEffects() {
  try {
    if (!fs.existsSync(LEARNED_EFFECTS_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(LEARNED_EFFECTS_PATH, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([key, value]) => [normalizeLearningKey(key), value])
    );
  } catch {
    return {};
  }
}

function saveLearnedEffects() {
  try {
    fs.mkdirSync(EFFECTS_DIR, { recursive: true });
    fs.writeFileSync(LEARNED_EFFECTS_PATH, `${JSON.stringify(sortObject(learnedEffects), null, 2)}\n`);
  } catch {
    // Learning must never block rendering.
  }
}

function analyzeRecentRenderLogs(logDir, limit = RECENT_LOG_LIMIT) {
  const analysis = emptyLogAnalysis();
  try {
    if (!fs.existsSync(logDir)) return analysis;
    const files = fs
      .readdirSync(logDir)
      .filter((entry) => entry.endsWith(".log"))
      .map((entry) => {
        const filePath = path.join(logDir, entry);
        return { filePath, entry, mtimeMs: fs.statSync(filePath).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, Math.max(4, Math.min(8, limit)));

    analysis.files_read = files.map((file) => file.entry);

    for (const file of files) {
      parseRenderLog(file.filePath, analysis);
    }

    analysis.advanced_effects = sortedCountEntries(analysis.effect_counts);
    analysis.fallback_effects = sortedCountEntries(analysis.fallback_counts);
    analysis.successful_effects = sortedCountEntries(analysis.success_counts);
    analysis.most_common_effects = analysis.advanced_effects.slice(0, 10);
    return analysis;
  } catch {
    return analysis;
  }
}

function parseRenderLog(filePath, analysis) {
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const learningMatch = line.match(/\[EffectLearning\]\s+requested="([^"]+)".*?mapped="([^"]+)"/);
    if (learningMatch) {
      const requested = normalizeLearningKey(learningMatch[1]);
      increment(analysis.effect_counts, requested);
      increment(analysis.fallback_counts, requested);
      analysis.learned_mappings[requested] = learningMatch[2];
      continue;
    }

    const renderMatch = line.match(/advanced_effect=(.+)$/);
    if (!renderMatch) continue;

    const raw = renderMatch[1].trim();
    if (!raw) continue;
    const requested = normalizeLearningKey(raw.replace(/\s*->\s*(fallback|[a-z0-9_ -]+)$/i, ""));
    if (requested === "none") continue;

    increment(analysis.effect_counts, requested);
    if (/->\s*fallback/i.test(raw)) {
      increment(analysis.fallback_counts, requested);
    } else {
      increment(analysis.success_counts, requested);
    }
  }
}

function resolveLearnedAdvancedEffect(name, supportedRegistry) {
  const requested = normalizeLearningKey(name);
  if (requested === "none") return null;

  const learned = learnedEffects[requested];
  if (learned) {
    return buildLearningResult(name, requested, learned, "learned_effects");
  }

  const heuristic = matchHeuristic(requested);
  if (heuristic) {
    persistLearnedEffect(requested, heuristic.mapped);
    return buildLearningResult(name, requested, heuristic.mapped, "heuristic_learning", heuristic.keyword);
  }

  const similar = matchSimilarity(requested, supportedRegistry);
  if (similar) {
    persistLearnedEffect(requested, similar.mapped);
    return buildLearningResult(name, requested, similar.mapped, "similarity_learning", similar.keyword);
  }

  const safeEffect = selectSafeEffect();
  persistLearnedEffect(requested, safeEffect);
  return buildLearningResult(name, requested, safeEffect, "safe_default");
}


function persistLearnedEffect(requested, mapped) {
  if (!requested || requested === "none") return;
  if (learnedEffects[requested] === mapped) return;
  learnedEffects[requested] = mapped;
  saveLearnedEffects();
}

function learnFrequentFallbacksFromLogs() {
  let changed = false;
  for (const [requested, count] of Object.entries(recentLogAnalysis.fallback_counts)) {
    if (count < AUTO_ALIAS_THRESHOLD || learnedEffects[requested]) continue;
    const heuristic = matchHeuristic(requested);
    const similar = heuristic ? null : matchSimilarity(requested, {});
    const mapped = heuristic ? heuristic.mapped : similar ? similar.mapped : selectSafeEffect();
    learnedEffects[requested] = mapped;

    changed = true;
  }

  if (changed) saveLearnedEffects();
}

function shouldSuggestAlias(name) {
  const requested = normalizeLearningKey(name);
  return (recentLogAnalysis.effect_counts[requested] || 0) >= AUTO_ALIAS_THRESHOLD;
}

function buildLearningResult(originalName, requested, mapped, source, matchedKeyword = "") {
  return {
    requested,
    requestedName: originalName || requested,
    mapped,
    mappedKey: normalizeRegistryKey(mapped),
    source,
    matchedKeyword,
    count: recentLogAnalysis.effect_counts[requested] || 0,
    suggestAlias: shouldSuggestAlias(requested),
  };
}

function matchHeuristic(requested) {
  for (const item of KEYWORD_MAPPINGS) {
    if (requested.includes(item.keyword)) return item;
  }
  return null;
}

function matchSimilarity(requested, supportedRegistry) {
  const requestedTokens = tokens(requested);
  let best = null;

  const candidates = SIMILAR_EFFECTS.concat(
    Object.entries(supportedRegistry || {})
      .filter(([, value]) => value && value.displayName)
      .map(([key, value]) => ({ name: value.displayName, mapped: key }))
  );

  for (const candidate of candidates) {
    const score = tokenOverlap(requestedTokens, tokens(candidate.name));
    if (!best || score > best.score) {
      best = { ...candidate, score };
    }
  }

  if (!best || best.score < 0.34) return null;
  return { mapped: best.mapped, keyword: best.name };
}

function createEffectAnalytics(effects) {
  const supported = [];
  const fallback = [];
  const detected = [];
  const currentCounts = {};

  for (const effect of effects) {
    const requested = effect.requestedName || effect.displayName || effect.key || "none";
    const normalized = normalizeLearningKey(requested);
    if (normalized === "none") continue;
    increment(currentCounts, normalized);

    if (effect.learning) {
      fallback.push({
        requested,
        mapped: effect.learning.mapped,
        source: effect.learning.source,
        matched_keyword: effect.learning.matchedKeyword || null,
      });
      detected.push(requested);
    } else {
      supported.push(effect.displayName || requested);
    }
  }

  const mergedCounts = { ...recentLogAnalysis.effect_counts };
  for (const [key, count] of Object.entries(currentCounts)) {
    mergedCounts[key] = (mergedCounts[key] || 0) + count;
  }

  return {
    supported_effects_used: unique(supported),
    fallback_effects_used: fallback,
    new_effects_detected: unique(detected),
    most_common_effects: sortedCountEntries(mergedCounts).slice(0, 10),
  };
}

function getRecentLogAnalysis() {
  return recentLogAnalysis;
}

function getLearnedEffectsPath() {
  return LEARNED_EFFECTS_PATH;
}

function emptyLogAnalysis() {
  return {
    files_read: [],
    advanced_effects: [],
    fallback_effects: [],
    successful_effects: [],
    most_common_effects: [],
    effect_counts: {},
    fallback_counts: {},
    success_counts: {},
    learned_mappings: {},
  };
}

function tokens(value) {
  return normalizeLearningKey(value).split(" ").filter(Boolean);
}

function tokenOverlap(a, b) {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  const hits = a.filter((token) => bSet.has(token)).length;
  return hits / Math.max(a.length, b.length);
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function sortedCountEntries(counts) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([effect, count]) => ({ effect, count }));
}

function unique(values) {
  return Array.from(new Set(values));
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function loadEffectStats() {
  try {
    if (fs.existsSync(STATS_PATH)) {
      return JSON.parse(fs.readFileSync(STATS_PATH, "utf8"));
    }
  } catch {}
  return {
    _meta: {
      bootstrapped: false,
      last_log_scanned: "",
      rr_index: 0,
    },
  };
}

function saveEffectStats(stats) {
  try {
    fs.mkdirSync(EFFECTS_DIR, { recursive: true });
    fs.writeFileSync(STATS_PATH, `${JSON.stringify(stats, null, 2)}\n`);
  } catch {}
}

function parseLogContentForStats(content) {
  const lines = content.split(/\r?\n/);
  const sceneEffects = [];
  let lastSceneIndex = -1;
  let allScenesRendered = false;
  let firstErrorSceneIndex = -1;

  for (const line of lines) {
    if (line.includes("Concat") || line.includes("concatScenes") || line.includes("Render completed:")) {
      allScenesRendered = true;
    }
    const sceneMatch = line.match(/Render scene (\d+)\/(\d+): .*?advanced_effect=(.+)$/);
    if (sceneMatch) {
      lastSceneIndex = sceneEffects.length;
      const raw = sceneMatch[3].trim();
      const hasArrow = raw.includes("->");
      const rawEffect = hasArrow ? raw.split("->")[1].trim() : raw;
      const effKey = normalizeRegistryKey(rawEffect);
      sceneEffects.push(effKey);
      continue;
    }
    if (line.includes("ERROR:") && firstErrorSceneIndex === -1 && !allScenesRendered) {
      if (lastSceneIndex >= 0) {
        firstErrorSceneIndex = lastSceneIndex;
      }
    }
  }

  if (firstErrorSceneIndex !== -1) {
    const failedEffect = sceneEffects[firstErrorSceneIndex];
    return {
      successes: [],
      failures: failedEffect && failedEffect !== "none" && failedEffect !== "fallback" ? [failedEffect] : [],
    };
  } else {
    const hasAnyError = lines.some((l) => l.includes("ERROR:"));
    if (hasAnyError) {
      return { successes: [], failures: [] };
    }
    const successes = unique(sceneEffects.filter((e) => e && e !== "none" && e !== "fallback"));
    return { successes, failures: [] };
  }
}

function applyLogStats(stats, logContent) {
  const { successes, failures } = parseLogContentForStats(logContent);
  for (const eff of successes) {
    if (!stats[eff]) stats[eff] = { success: 0, fail: 0 };
    stats[eff].success = (stats[eff].success || 0) + 1;
  }
  for (const eff of failures) {
    if (!stats[eff]) stats[eff] = { success: 0, fail: 0 };
    stats[eff].fail = (stats[eff].fail || 0) + 1;
  }
}

function bootstrapEffectStatsIfNeeded(logDir) {
  const stats = loadEffectStats();
  if (stats._meta && stats._meta.bootstrapped) return stats;

  let scanned = 0;
  if (fs.existsSync(logDir)) {
    const files = fs.readdirSync(logDir).filter((f) => f.endsWith(".log"));
    for (const file of files) {
      const filePath = path.join(logDir, file);
      try {
        const content = fs.readFileSync(filePath, "utf8");
        applyLogStats(stats, content);
        scanned++;
      } catch {}
    }
  }

  stats._meta = stats._meta || {};
  stats._meta.bootstrapped = true;
  saveEffectStats(stats);
  console.log(`[SuccessStats] Bootstrap: scanned ${scanned} files`);
  return stats;
}

function updateEffectStatsFromLog(logPath) {
  const stats = loadEffectStats();
  try {
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, "utf8");
      applyLogStats(stats, content);
      stats._meta = stats._meta || {};
      stats._meta.last_log_scanned = logPath;
      saveEffectStats(stats);
    }
  } catch {}
  return stats;
}

function getSafePool(stats, options = {}) {
  const minSamples = options.minSamples ?? 5;
  const minSuccessRate = options.minSuccessRate ?? 0.9;
  const poolSize = options.poolSize ?? 5;

  const entries = [];
  for (const [key, value] of Object.entries(stats || {})) {
    if (key === "_meta" || key === "fallback" || key === "none" || !value || typeof value !== "object") continue;
    const success = Number(value.success) || 0;
    const fail = Number(value.fail) || 0;
    const total = success + fail;
    const rate = success / Math.max(1, total);
    if (total >= minSamples && rate >= minSuccessRate) {
      entries.push({ key, total, rate });
    }
  }

  entries.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  return entries.slice(0, poolSize).map((item) => item.key);
}

function selectSafeEffect() {
  const stats = loadEffectStats();
  const pool = getSafePool(stats);
  if (!pool || pool.length === 0) {
    return DEFAULT_SAFE_EFFECT;
  }
  stats._meta = stats._meta || {};
  const index = (Number(stats._meta.rr_index) || 0) % pool.length;
  const selected = pool[index];
  stats._meta.rr_index = (index + 1) % pool.length;
  saveEffectStats(stats);
  return selected;
}

module.exports = {
  bootstrapEffectStatsIfNeeded,
  createEffectAnalytics,
  getLearnedEffectsPath,
  getRecentLogAnalysis,
  getSafePool,
  initializeEffectLearning,
  normalizeLearningKey,
  resolveLearnedAdvancedEffect,
  selectSafeEffect,
  updateEffectStatsFromLog,
};

