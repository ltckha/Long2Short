#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

function hasAudioStream(filePath) {
  try {
    const output = execSync(
      `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath}"`,
      { encoding: "utf8" }
    );
    return output.trim() === "audio";
  } catch (error) {
    return false;
  }
}

function resolveVoiceWav(sceneId) {
  if (!videoId || !sceneId) return null;
  const wavPath = path.join(INCOMING_DIR, `${videoId}_${sceneId}.wav`);
  if (fs.existsSync(wavPath)) return wavPath;
  return null;
}

const {
  buildAdvancedFilters,
  buildMotionPlan,
  formatEffectLog,
  normalizeAdvancedEffect,
  resolveAdvancedEffect,
  resolveTextEffect,
  summarizeMotionPlan,
} = require("./effects");
const {
  bootstrapEffectStatsIfNeeded,
  createEffectAnalytics,
  getLearnedEffectsPath,
  initializeEffectLearning,
  updateEffectStatsFromLog,
} = require("./effectLearning");
const {
  archiveFailedRender,
  archiveSuccessfulRender,
  createWorkflowContext,
} = require("./archiveWorkflow");
const { resolveFont } = require("./fontRegistry");
const { prepareSubtitleLayout, wrapSubtitleText } = require("./subtitleLayoutEngine");
const { resolveSubtitleStyle } = require("./subtitleStyles");
const { getSubtitlePosition } = require("./textPositionEngine");
const {
  buildTransitionFilterComplex,
  computeXfadeOffsets,
  hasAnyTransitions,
} = require("./transitions");
const {
  syncAnalyticsToSheet,
  syncProjectToSheet,
} = require("./googleSheetsSync");

const ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(ROOT, "..");
const RAW_DIR = path.join(ROOT, "raw");
const TIMELINE_DIR = path.join(ROOT, "timeline");
const OUTPUT_DIR = path.join(ROOT, "output");
const TEMP_DIR = path.join(ROOT, "temp");
const LOG_DIR = path.join(ROOT, "logs");
const EFFECT_ANALYTICS_DIR = path.join(LOG_DIR, "effect_analytics");
const FONT_CACHE_DIR = path.join(TEMP_DIR, "fontconfig");
const INCOMING_DIR = path.join(WORKSPACE_ROOT, "incoming");
const RENDERED_DIR = path.join(WORKSPACE_ROOT, "rendered");
const ARCHIVE_DIR = path.join(WORKSPACE_ROOT, "archive");
const FAILED_DIR = path.join(WORKSPACE_ROOT, "failed");

const TARGET = {
  width: 1080,
  height: 1920,
  fps: 30,
};

const AUDIO_ENABLED = true;
const OPENING_HOOK = {
  enabled: true,
  minDuration: 1.5,
  maxDuration: 3,
  minConfidence: 0.65,
  maxSourceDuration: 12,
};

const SUBTITLE = {
  safeX: 150,
  safeTop: 190,
  safeBottom: 260,
  topRatio: 0.1,
  centerRatio: 0.46,
  bottomRatio: 0.13,
  baseFontSize: 70,
  minFontSize: 50,
  border: 2,
};

let videoId = "";
let timelinePath = "";
let logPath = path.join(LOG_DIR, "render.log");
let workflow = null;

function ensureDirs() {
  for (const dir of [
    RAW_DIR,
    TIMELINE_DIR,
    OUTPUT_DIR,
    TEMP_DIR,
    LOG_DIR,
    EFFECT_ANALYTICS_DIR,
    FONT_CACHE_DIR,
    INCOMING_DIR,
    RENDERED_DIR,
    ARCHIVE_DIR,
    FAILED_DIR,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(logPath, `${line}\n`);
}

function fail(message, error) {
  log(`ERROR: ${message}`);
  if (error) {
    log(error.stack || String(error));
  }
  const failure = new Error(message);
  if (error) failure.cause = error;
  throw failure;
}

function configureProject(project) {
  videoId = project.id;
  timelinePath = project.timelinePath;
  logPath = path.join(LOG_DIR, `${videoId}_render.log`);
  workflow = createWorkflowContext({
    enabled: project.workflowEnabled,
    projectId: videoId,
    incomingDir: INCOMING_DIR,
    renderedDir: RENDERED_DIR,
    archiveDir: ARCHIVE_DIR,
    failedDir: FAILED_DIR,
    timelinePath,
  });
}

function resolveTimelinePath(projectId, explicitPath) {
  if (explicitPath) return path.resolve(explicitPath);

  const incomingPath = path.join(INCOMING_DIR, `${projectId}.json`);
  if (fs.existsSync(incomingPath)) return incomingPath;

  const legacyPath = path.join(TIMELINE_DIR, `${projectId}.json`);
  if (fs.existsSync(legacyPath)) return legacyPath;

  return legacyPath;
}

function discoverIncomingProjects() {
  if (!fs.existsSync(INCOMING_DIR)) return [];

  return fs
    .readdirSync(INCOMING_DIR)
    .filter((entry) => path.extname(entry).toLowerCase() === ".json")
    .map((entry) => path.basename(entry, ".json"))
    .filter((projectId) => {
      const jsonPath = path.join(INCOMING_DIR, `${projectId}.json`);
      const videoPath = path.join(INCOMING_DIR, `${projectId}.mp4`);
      const hasPair = fs.existsSync(videoPath);
      if (hasPair) {
        log(`Project detected: ${projectId}`);
        log(`Source files found: ${videoPath}, ${jsonPath}`);
      } else {
        log(`WARN: Bỏ qua ${projectId}, thiếu source video: ${videoPath}`);
      }
      return hasPair;
    })
    .map((projectId) => ({
      id: projectId,
      timelinePath: path.join(INCOMING_DIR, `${projectId}.json`),
      workflowEnabled: true,
    }));
}

function getRequestedProject() {
  const projectId = process.argv[2];
  if (!projectId) return null;

  const requestedTimelinePath = resolveTimelinePath(projectId, process.argv[3]);
  return {
    id: projectId,
    timelinePath: requestedTimelinePath,
    workflowEnabled: isPathInside(requestedTimelinePath, INCOMING_DIR),
  };
}

function isPathInside(filePath, dirPath) {
  const relative = path.relative(dirPath, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function run(command, args, label) {
  return new Promise((resolve, reject) => {
    log(`RUN ${label}: ${command} ${args.map(formatArgForLog).join(" ")}`);

    const child = spawn(command, args, {
      cwd: ROOT,
      env: {
        ...process.env,
        XDG_CACHE_HOME: TEMP_DIR,
      },
    });
    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      fs.appendFileSync(logPath, text);
    });

    child.on("error", (error) => {
      reject(new Error(`${label} failed to start: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const tail = stderr.split("\n").slice(-24).join("\n");
      reject(new Error(`${label} exited with code ${code}\n${tail}`));
    });
  });
}

function formatArgForLog(arg) {
  return /\s/.test(arg) ? JSON.stringify(arg) : arg;
}

function loadTimeline(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(
      `Không tìm thấy timeline: ${filePath}\n` +
        `Tạo file JSON có dạng: {"scenes":[{"start":0,"end":3,"subtitle":"Hello"}]}`
    );
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Timeline JSON không hợp lệ: ${filePath}`, error);
  }
}

function resolveInputVideo(timeline) {
  const configured = timeline.input || timeline.video || timeline.source;
  const inputPath = configured
    ? resolveProjectPath(configured)
    : workflow.enabled
      ? path.join(INCOMING_DIR, `${videoId}.mp4`)
      : path.join(RAW_DIR, `${videoId}.mp4`);

  if (!fs.existsSync(inputPath)) {
    fail(`Không tìm thấy video input: ${inputPath}`);
  }

  return inputPath;
}

function resolveProjectPath(filePath, baseTimelinePath = timelinePath) {
  if (path.isAbsolute(filePath)) return filePath;

  const timelineRelativePath = path.resolve(path.dirname(baseTimelinePath), filePath);
  if (fs.existsSync(timelineRelativePath)) return timelineRelativePath;

  return path.resolve(ROOT, filePath);
}

function resolveOutputPath(timeline) {
  if (timeline.output) return resolveProjectPath(timeline.output);

  if (workflow.enabled) {
    return path.join(RENDERED_DIR, `${videoId}_final.mp4`);
  }

  return path.join(OUTPUT_DIR, `${videoId}_final.mp4`);
}

function normalizeTimeline(timeline) {
  if (Array.isArray(timeline) || Array.isArray(timeline.scenes)) {
    return timeline;
  }

  if (!Array.isArray(timeline.timeline)) {
    return timeline;
  }

  return {
    ...timeline,
    scenes: timeline.timeline
      .filter((scene) => scene && scene.include !== false)
      .map((scene) => ({
        ...scene,
        id: scene.scene_id || scene.id,
        start: scene.start_s ?? scene.start,
        end: scene.end_s ?? scene.end,
        duration: scene.duration_s ?? scene.duration,
        subtitle: scene.subtitle || scene.title || "",
        subtitle_style: scene.subtitle_style || scene.subtitleStyle,
        text_position: scene.text_position || scene.textPosition,
        text_effect: getEffectName(scene.text_effect),
        advanced_effect: normalizeAdvancedEffect(scene.advanced_effect),
      })),
  };
}

function getEffectName(effect) {
  if (!effect) return "none";
  if (typeof effect === "string") return effect;
  if (typeof effect === "object" && typeof effect.name === "string") return effect.name;
  return "none";
}

function normalizeScenes(timeline) {
  const normalizedTimeline = normalizeTimeline(timeline);
  const rawScenes = Array.isArray(normalizedTimeline) ? normalizedTimeline : normalizedTimeline.scenes;
  const includedScenes = Array.isArray(rawScenes)
    ? rawScenes.filter((scene) => scene && scene.include !== false)
    : [];

  if (includedScenes.length === 0) {
    fail(`Timeline phải có mảng scenes không rỗng: ${timelinePath}`);
  }

  return includedScenes.map((scene, index) => {
    const start = timeToSeconds(scene.start ?? scene.from ?? scene.in);
    const endValue = scene.end ?? scene.to ?? scene.out;
    const durationValue = scene.duration ?? scene.length;
    const end =
      endValue !== undefined ? timeToSeconds(endValue) : start + timeToSeconds(durationValue);
    const sourceDuration = end - start;
    const targetDuration =
      durationValue !== undefined ? timeToSeconds(durationValue) : sourceDuration;
    const duration = targetDuration;

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      !Number.isFinite(sourceDuration) ||
      !Number.isFinite(targetDuration) ||
      sourceDuration <= 0 ||
      targetDuration <= 0
    ) {
      fail(
        `Scene ${index + 1} thiếu start/end/duration hợp lệ. ` +
          `Nhận được start=${scene.start}, end=${scene.end}, duration=${scene.duration}`
      );
    }

    return {
      ...scene,
      id: scene.id || `scene_${String(index + 1).padStart(3, "0")}`,
      index,
      start,
      end,
      duration,
      sourceDuration,
      targetDuration,
      speedFactor: sourceDuration / targetDuration,
      keyMoments: normalizeKeyMoments(scene.key_moments || scene.keyMoments, start, end),
      speedStrategy: scene.speed_strategy || scene.speedStrategy || "uniform",
      renderPriority: scene.render_priority || scene.renderPriority || "normal",
      subtitleStyle: scene.subtitle_style || scene.subtitleStyle,
      textPosition: scene.text_position || scene.textPosition || "bottom",
      textEffect: getEffectName(scene.text_effect || scene.textEffect),
      advancedEffect: normalizeAdvancedEffect(scene.advanced_effect || scene.advancedEffect),
    };
  });
}

function normalizeKeyMoments(value, start, end) {
  if (!Array.isArray(value)) return [];

  return value
    .map((moment) => timeToSeconds(moment))
    .filter((moment) => Number.isFinite(moment) && moment > start && moment < end)
    .map((moment) => Number((moment - start).toFixed(3)))
    .sort((a, b) => a - b);
}

function buildRenderScenes(scenes) {
  if (!OPENING_HOOK.enabled || scenes.length < 2) return reindexScenes(scenes);

  const selected = selectOpeningHookScene(scenes);
  if (!selected) {
    log("Opening hook skipped: no eligible scene.");
    return reindexScenes(scenes);
  }

  const sourceScene = selected.scene;
  log(
    `Selected opening hook: source_scene_id=${sourceScene.id} original_position=${sourceScene.index + 1} ` +
      `opening_duration=${selected.duration.toFixed(3)}s`
  );
  log(
    `Hook scores: retention_score=${selected.scores.retentionScore.toFixed(3)} ` +
      `hook_strength=${selected.scores.hookStrength.toFixed(3)} ` +
      `visual_energy=${selected.scores.visualEnergy.toFixed(3)} ` +
      `confidence=${selected.scores.confidence.toFixed(3)}`
  );

  if (sourceScene.index === 0) {
    log("Opening hook source is already first included scene; no clone prepended.");
    return reindexScenes(scenes);
  }

  const hookScene = createOpeningHookScene(sourceScene, selected.duration);
  log(`Opening hook cloned: ${sourceScene.id} -> ${hookScene.id}`);
  return reindexScenes([hookScene, ...scenes]);
}

function selectOpeningHookScene(scenes) {
  const candidates = scenes
    .map((scene) => ({
      scene,
      scores: getHookScores(scene),
      eligible: isHookEligible(scene),
    }))
    .filter((candidate) => candidate.eligible);

  if (!candidates.length) return null;

  candidates.sort(compareHookCandidates);
  const selected = candidates[0];
  return {
    ...selected,
    duration: openingHookDuration(selected.scene),
  };
}

function getHookScores(scene) {
  const confidence = numericScore(scene.confidence);
  return {
    retentionScore: numericScore(scene.retention_score ?? scene.retentionScore, confidence),
    hookStrength: numericScore(scene.hook_strength ?? scene.hookStrength, confidence),
    visualEnergy: numericScore(scene.visual_energy ?? scene.visualEnergy, confidence),
    confidence,
  };
}

function numericScore(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(number, 0, 1);
}

function compareHookCandidates(a, b) {
  const scoreKeys = ["retentionScore", "hookStrength", "visualEnergy", "confidence"];
  for (const key of scoreKeys) {
    const diff = b.scores[key] - a.scores[key];
    if (Math.abs(diff) > 0.0001) return diff;
  }

  return a.scene.index - b.scene.index;
}

function isHookEligible(scene) {
  const sceneType = normalizeKey(scene.scene_type || scene.sceneType);
  const confidence = numericScore(scene.confidence);
  const cueText = `${scene.visual_cue || ""} ${scene.title || ""} ${scene.subtitle || ""}`;

  if (confidence < OPENING_HOOK.minConfidence) return false;
  if (scene.duration < OPENING_HOOK.minDuration) return false;
  if (scene.duration > OPENING_HOOK.maxSourceDuration) return false;
  if (["cta", "ctaend", "cta_end", "intro"].includes(sceneType)) return false;
  if (hasNegativeHookCue(cueText)) return false;

  const scores = getHookScores(scene);
  if (scores.retentionScore < 0.55 && scores.hookStrength < 0.55 && scores.visualEnergy < 0.55) {
    return false;
  }

  return true;
}

function hasNegativeHookCue(text) {
  const normalized = normalizeKey(text);
  const negativePatterns = [
    "watermark",
    "static",
    "still",
    "lowenergy",
    "nangim",
    "namim",
    "codinh",
    "loayhoay",
    "chemat",
    "laplai",
  ];

  return negativePatterns.some((pattern) => normalized.includes(pattern));
}

function openingHookDuration(scene) {
  return clamp(scene.duration, OPENING_HOOK.minDuration, OPENING_HOOK.maxDuration);
}

function createOpeningHookScene(sourceScene, duration) {
  const sourceDuration = Math.max(0.1, sourceScene.duration);
  const startOffset = sourceDuration > duration + 0.2
    ? Math.max(0, Math.min(sourceDuration - duration, sourceDuration * 0.35))
    : 0;

  let advancedEffect = sourceScene.advancedEffect;
  if (advancedEffect && typeof advancedEffect === "object") {
    const baseIntensity = typeof advancedEffect.intensity === "number" ? advancedEffect.intensity : 0.8;
    advancedEffect = {
      ...advancedEffect,
      intensity: Math.min(1.0, baseIntensity * 1.1),
    };
  }

  return {
    ...sourceScene,
    id: `opening_hook_${safeName(sourceScene.id)}`,
    sourceSceneId: sourceScene.id,
    openingHook: true,
    start: sourceScene.start + startOffset,
    end: sourceScene.start + startOffset + duration,
    duration,
    sourceDuration: duration,
    targetDuration: duration,
    speedFactor: 1,
    keyMoments: [],
    speedStrategy: "uniform",
    renderPriority: "keep",
    textEffect: sourceScene.textEffect === "none" ? "Pop-up" : sourceScene.textEffect,
    advancedEffect,
  };
}

function reindexScenes(scenes) {
  return scenes.map((scene, index) => ({
    ...scene,
    renderIndex: index,
    index,
  }));
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function timeToSeconds(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    if (/^\d+(\.\d+)?$/.test(value)) return Number(value);

    const parts = value.split(":").map(Number);
    if (parts.some((part) => !Number.isFinite(part))) return NaN;

    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }

  return NaN;
}

function buildVideoFilters(scene) {
  const filters = [
    `scale=${TARGET.width}:${TARGET.height}:force_original_aspect_ratio=increase`,
    `crop=${TARGET.width}:${TARGET.height}`,
    `fps=${TARGET.fps}`,
  ];
  filters.push(...buildAdvancedFilters(scene, TARGET));
  if (scene.openingHook) {
    filters.push(...buildOpeningHookFilters(scene));
  }

  const textFilters = buildTextFilters(scene);
  return filters.concat(textFilters, ["format=yuv420p"]).join(",");
}

function buildOpeningHookFilters(scene) {
  const duration = Math.max(0.1, scene.duration);
  const fadeStart = Math.max(0, duration - 0.12);

  return [
    `scale=w='trunc(${TARGET.width}*(1+0.035*t/${duration.toFixed(3)})/2)*2':h='trunc(${
      TARGET.height
    }*(1+0.035*t/${duration.toFixed(3)})/2)*2':eval=frame`,
    `crop=${TARGET.width}:${TARGET.height}`,
    "eq=contrast=1.055:saturation=1.035",
    `fade=t=out:st=${fadeStart.toFixed(3)}:d=0.120:color=white`,
  ];
}

function buildTextFilters(scene) {
  const cues = collectTextCues(scene);
  const filters = [];

  cues.forEach((cue, cueIndex) => {
    const effect = resolveTextEffect(cue.effect);
    log(`Text effect scene=${scene.id} cue=${cueIndex} using=${formatEffectLog(effect)}`);

    if (effect.typewriter) {
      filters.push(...buildTypingFilters(cue, scene, cueIndex, effect));
      return;
    }

    filters.push(drawTextFilter(cue, effect, scene, cueIndex));
  });

  return filters;
}

function collectTextCues(scene) {
  const cues = [];
  const defaultEffect = scene.textEffect;
  const sceneText = scene.subtitle || scene.caption || scene.text || scene.title;

  if (sceneText) {
    cues.push({
      text: String(sceneText),
      start: 0,
      end: scene.duration,
      effect: defaultEffect,
      subtitle_style: scene.subtitleStyle,
      text_position: scene.textPosition,
    });
  }

  const subtitles = scene.subtitles || scene.captions || [];
  if (Array.isArray(subtitles)) {
    for (const item of subtitles) {
      if (!item || !item.text) continue;

      const start = cueTimeToSceneTime(item.start ?? item.from ?? 0, scene);
      const end = cueTimeToSceneTime(item.end ?? item.to ?? scene.duration, scene);
      cues.push({
        text: String(item.text),
        start: clamp(start, 0, scene.duration),
        end: clamp(end, 0, scene.duration),
        effect: item.text_effect || item.textEffect || defaultEffect,
        subtitle_style: item.subtitle_style || item.subtitleStyle || scene.subtitleStyle,
        text_position: item.text_position || item.textPosition || scene.textPosition,
      });
    }
  }

  return cues.filter((cue) => cue.text.trim() && cue.end > cue.start);
}

function cueTimeToSceneTime(value, scene) {
  const seconds = timeToSeconds(value);
  if (!Number.isFinite(seconds)) return 0;

  return seconds >= scene.start && seconds <= scene.end ? seconds - scene.start : seconds;
}

function buildTypingFilters(cue, scene, cueIndex) {
  const text = cue.text.trim();
  const chars = Array.from(text).slice(0, 90);
  const duration = Math.max(0.1, Math.min(1.6, cue.end - cue.start));
  const step = duration / chars.length;
  const filters = [];
  const typingPreset = resolveSubtitleStyle(scene, cue, cueIndex);
  const typingFont = resolveFont(typingPreset.font);
  const typingPosition = getSubtitlePosition(cue.text_position || scene.textPosition, SUBTITLE);
  const typingStyle = prepareSubtitleText(text, typingPreset);

  logSubtitleStyle(scene, cueIndex, typingStyle, typingPreset, typingFont, typingPosition);

  chars.forEach((_, index) => {
    const from = cue.start + index * step;
    const to = index === chars.length - 1 ? cue.end : cue.start + (index + 1) * step;
    const prefix = chars.slice(0, index + 1).join("");
    const prefixLines = wrapSubtitleText(prefix, typingStyle.maxChars);
    filters.push(
      drawTextFilter(
        {
          ...cue,
          text: prefix,
          start: from,
          end: to,
        },
        resolveTextEffect("none"),
        scene,
        `${cueIndex}_${index}`,
        {
          ...typingStyle,
          wrappedText: prefixLines.join("\n"),
          lines: prefixLines,
        },
        false
      )
    );
  });

  return filters;
}

function drawTextFilter(cue, effect, scene, cueIndex, subtitleStyle, shouldLog = true) {
  const preset = resolveSubtitleStyle(scene, cue, cueIndex);
  const font = resolveFont(preset.font);
  const style = subtitleStyle || prepareSubtitleText(cue.text, preset);
  const position = getSubtitlePosition(cue.text_position || scene.textPosition, SUBTITLE);
  const textFile = writeSubtitleTextFile(scene, cueIndex, style.wrappedText);
  const effectOptions = effect.build({ cue, style, subtitle: SUBTITLE, baseY: position.y });

  if (shouldLog) {
    logSubtitleStyle(scene, cueIndex, style, preset, font, position);
  }

  if (Array.isArray(preset.layers) && preset.layers.length) {
    return preset.layers
      .map((layer) => buildDrawTextFilterOptions({
        textFile,
        font,
        style,
        preset,
        effectOptions,
        cue,
        layer,
        positionY: position.y,
      }))
      .join(",");
  }

  return buildDrawTextFilterOptions({
    textFile,
    font,
    style,
    preset,
    effectOptions,
    cue,
    positionY: position.y,
  });
}

function buildDrawTextFilterOptions({ textFile, font, style, preset, effectOptions, cue, positionY, layer = {} }) {
  const lineSpacing = Math.round(style.lineSpacing * (preset.lineSpacingScale || 1));
  const x = applyExpressionOffset(layer.x || effectOptions.x || "(w-text_w)/2", layer.xOffset || 0);
  const y = applyExpressionOffset(layer.y || effectOptions.y || positionY, layer.yOffset || 0);
  const options = [
    `drawtext=textfile='${escapeFilterValue(textFile)}'`,
    `fontfile='${escapeFilterValue(font.path)}'`,
    `fontcolor=${layer.fontcolor || effectOptions.fontcolor || preset.fontcolor}`,
    `fontsize=${style.fontSize}`,
    `line_spacing=${lineSpacing}`,
    `borderw=${layer.borderw || effectOptions.borderw || preset.borderw || SUBTITLE.border}`,
    `bordercolor=${layer.bordercolor || effectOptions.bordercolor || preset.bordercolor}`,
    `shadowx=${layer.shadowx || effectOptions.shadowx || preset.shadowx}`,
    `shadowy=${layer.shadowy || effectOptions.shadowy || preset.shadowy}`,
    `shadowcolor=${layer.shadowcolor || effectOptions.shadowcolor || preset.shadowcolor}`,
    `box=${layer.box === undefined ? (effectOptions.box === undefined ? (preset.box === false ? "0" : "1") : effectOptions.box) : layer.box}`,
    `boxcolor=${layer.boxcolor || effectOptions.boxcolor || preset.boxcolor}`,
    `boxborderw=${layer.boxborderw || effectOptions.boxborderw || preset.boxborderw}`,
    "text_align=C",
    `x=${x}`,
    `y=${y}`,
    `enable='between(t\\,${cue.start.toFixed(3)}\\,${cue.end.toFixed(3)})'`,
  ];

  if (Array.isArray(effectOptions.extraOptions)) {
    options.push(...effectOptions.extraOptions);
  }

  const hasEffectAlpha = Array.isArray(effectOptions.extraOptions)
    && effectOptions.extraOptions.some((option) => option.startsWith("alpha="));
  if (!hasEffectAlpha) {
    options.push(...buildSubtitlePresetAnimationOptions(preset, cue));
  }

  return options.join(":");
}

function applyExpressionOffset(expression, offset) {
  if (!offset) return expression;

  const raw = String(expression);
  const quoted = raw.startsWith("'") && raw.endsWith("'");
  const inner = quoted ? raw.slice(1, -1) : raw;
  const sign = Number(offset) >= 0 ? "+" : "";
  const value = `${sign}${Number(offset)}`;
  const next = `(${inner})${value}`;

  return quoted || /[+\-*/()]/.test(inner) ? `'${next}'` : next;
}

function buildSubtitlePresetAnimationOptions(preset, cue) {
  if (preset.animation === "soft_pop") {
    return [
      `alpha='if(lt(t\\,${(cue.start + 0.18).toFixed(3)})\\,0.82+0.18*(t-${cue.start.toFixed(
        3
      )})/0.18\\,1)'`,
    ];
  }

  if (preset.animation === "cinematic_fade") {
    return [
      `alpha='if(lt(t\\,${(cue.start + 0.3).toFixed(3)})\\,0.08+0.92*(t-${cue.start.toFixed(
        3
      )})/0.3\\,1)'`,
    ];
  }

  if (preset.animation === "hook_lift") {
    return [
      `alpha='if(lt(t\\,${(cue.start + 0.26).toFixed(3)})\\,0.10+0.90*(t-${cue.start.toFixed(
        3
      )})/0.26\\,1)'`,
    ];
  }

  if (preset.animation === "luminous_fade") {
    return [
      `alpha='if(lt(t\\,${(cue.start + 0.34).toFixed(3)})\\,0.12+0.88*(t-${cue.start.toFixed(
        3
      )})/0.34\\,0.98)'`,
    ];
  }

  if (preset.animation === "cta_focus") {
    return [
      `alpha='if(lt(t\\,${(cue.start + 0.24).toFixed(3)})\\,0.12+0.88*(t-${cue.start.toFixed(
        3
      )})/0.24\\,1)'`,
    ];
  }

  if (preset.animation === "fade") {
    return [
      `alpha='if(lt(t\\,${(cue.start + 0.22).toFixed(3)})\\,(t-${cue.start.toFixed(
        3
      )})/0.22\\,1)'`,
    ];
  }

  if (preset.animation === "pulse") {
    return [`alpha='0.88+0.12*abs(sin((t-${cue.start.toFixed(3)})*7))'`];
  }

  if (preset.animation === "pop") {
    return [
      `alpha='if(lt(t\\,${(cue.start + 0.18).toFixed(3)})\\,(t-${cue.start.toFixed(
        3
      )})/0.18\\,1)'`,
    ];
  }

  return [];
}

function writeSubtitleTextFile(scene, cueIndex, text) {
  const fileName = `${videoId}_${String(scene.index + 1).padStart(3, "0")}_${safeName(
    scene.id
  )}_subtitle_${cueIndex}.txt`;
  const filePath = path.join(TEMP_DIR, fileName);

  fs.writeFileSync(filePath, String(text), "utf8");
  return filePath;
}

function prepareSubtitleText(text, preset) {
  return prepareSubtitleLayout(text, {
    target: TARGET,
    safeX: SUBTITLE.safeX,
    safeTop: SUBTITLE.safeTop,
    safeBottom: SUBTITLE.safeBottom,
    baseFontSize: SUBTITLE.baseFontSize,
    minFontSize: SUBTITLE.minFontSize,
    styleFontSize: preset && preset.fontsize,
    maxLines: preset && preset.maxLines ? preset.maxLines : 2,
  });
}

function logSubtitleStyle(
  scene,
  cueIndex,
  style,
  preset = { key: "clean_white", source: "fallback" },
  font = { family: "unknown", path: "unknown" },
  position = { key: "bottom" }
) {
  log(
    `Subtitle scene=${scene.id} cue=${cueIndex} ` +
      `lines=${style.lines.length} fontsize=${style.fontSize} ` +
      `max_chars=${style.maxChars} style=${preset.key} source=${preset.source} ` +
      `font=${font.family} fontfile=${font.path} position=${position.key}`
  );
}

function escapeFilterValue(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/%/g, "\\%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/;/g, "\\;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sceneOutputPath(scene) {
  const sceneName = `${String(scene.index + 1).padStart(3, "0")}_${safeName(scene.id)}.mp4`;
  return path.join(TEMP_DIR, `${videoId}_${sceneName}`);
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "");
}

function shouldTemporalWarp(scene) {
  const sourceDuration = scene.sourceDuration || scene.duration;
  const targetDuration = scene.targetDuration || scene.duration;
  return (
    !scene.openingHook &&
    sourceDuration > 0 &&
    targetDuration > 0 &&
    (Math.abs(sourceDuration - targetDuration) > 0.12 || (scene.keyMoments || []).length > 0)
  );
}

function buildTemporalSegments(scene) {
  const sourceDuration = Math.max(0.1, scene.sourceDuration || scene.duration);
  const targetDuration = Math.max(0.1, scene.targetDuration || scene.duration);
  const strategy = scene.speedStrategy || "uniform";
  const priority = scene.renderPriority || "normal";
  const anchors = (scene.keyMoments || [])
    .filter((moment) => moment > 0.05 && moment < sourceDuration - 0.05)
    .sort((a, b) => a - b);
  const cuts = [0, sourceDuration];
  const radius = anchorWindowRadius(sourceDuration, targetDuration, strategy, priority);

  for (const anchor of anchors) {
    cuts.push(clamp(anchor - radius, 0, sourceDuration));
    cuts.push(clamp(anchor + radius, 0, sourceDuration));
  }

  const normalizedCuts = [...new Set(cuts.map((cut) => Number(cut.toFixed(3))))]
    .sort((a, b) => a - b)
    .filter((cut, index, list) => index === 0 || cut - list[index - 1] >= 0.12);

  if (normalizedCuts[normalizedCuts.length - 1] < sourceDuration - 0.05) {
    normalizedCuts.push(Number(sourceDuration.toFixed(3)));
  }

  const rawSegments = [];
  for (let index = 0; index < normalizedCuts.length - 1; index += 1) {
    const from = normalizedCuts[index];
    const to = normalizedCuts[index + 1];
    if (to - from < 0.12) continue;
    rawSegments.push({
      from,
      to,
      sourceDuration: to - from,
      importance: segmentImportance(from, to, anchors, strategy, priority),
    });
  }

  return allocateSegmentDurations(rawSegments, targetDuration, strategy, priority);
}

function anchorWindowRadius(sourceDuration, targetDuration, strategy, priority) {
  const base = Math.min(1.35, Math.max(0.55, targetDuration * 0.09));
  if (priority === "keep") return Math.min(1.8, base * 1.25);
  if (strategy === "jumpcut") return Math.max(0.45, base * 0.72);
  if (strategy === "ramp") return Math.min(1.6, base * 1.12);
  if (strategy === "adaptive") return Math.min(1.5, base);
  return Math.min(1.2, base * 0.88);
}

function segmentImportance(from, to, anchors, strategy, priority) {
  const center = (from + to) / 2;
  const nearAnchor = anchors.some((anchor) => anchor >= from - 0.08 && anchor <= to + 0.08);
  const distanceToAnchor = anchors.length
    ? Math.min(...anchors.map((anchor) => Math.abs(anchor - center)))
    : Infinity;
  let importance = 0.42;

  if (nearAnchor) importance = 1;
  else if (distanceToAnchor < 2.4) importance = 0.68;

  if (strategy === "ramp" && (from < 0.2 || to > Math.max(...anchors, 0))) importance += 0.08;
  if (strategy === "adaptive" && nearAnchor) importance += 0.16;
  if (strategy === "jumpcut" && !nearAnchor) importance -= 0.14;
  if (priority === "keep") importance += nearAnchor ? 0.18 : 0.08;
  if (priority === "compress" && !nearAnchor) importance -= 0.08;

  return clamp(importance, 0.18, 1.25);
}

function allocateSegmentDurations(segments, targetDuration, strategy, priority) {
  if (segments.length === 0) return [];

  const minSpeed = priority === "keep" ? 1.15 : 1.35;
  const maxSpeed = strategy === "jumpcut" ? 8 : priority === "compress" ? 7 : 6;
  const weightedTotal = segments.reduce(
    (sum, segment) => sum + segment.sourceDuration * segment.importance,
    0
  );
  const allocated = segments.map((segment) => {
    const weightedShare = (segment.sourceDuration * segment.importance) / weightedTotal;
    const idealTarget = targetDuration * weightedShare;
    const minTarget = segment.sourceDuration / maxSpeed;
    const maxTarget = segment.sourceDuration / minSpeed;
    const segmentTarget = clamp(idealTarget, minTarget, maxTarget);
    return {
      ...segment,
      targetDuration: segmentTarget,
    };
  });

  const total = allocated.reduce((sum, segment) => sum + segment.targetDuration, 0);
  const scale = targetDuration / total;
  return allocated.map((segment, index) => {
    const target = Math.max(0.08, segment.targetDuration * scale);
    return {
      ...segment,
      index,
      targetDuration: target,
      speed: segment.sourceDuration / target,
    };
  });
}

function logTemporalWarp(scene, segments) {
  const segmentText = segments
    .map(
      (segment) =>
        `${segment.from.toFixed(2)}-${segment.to.toFixed(2)}@${segment.speed.toFixed(2)}x`
    )
    .join(" | ");
  log(
    `[TemporalWarp] scene=${scene.id} source=${scene.start.toFixed(3)}-${scene.end.toFixed(
      3
    )} source_duration=${(scene.sourceDuration || scene.duration).toFixed(3)} ` +
      `target_duration=${(scene.targetDuration || scene.duration).toFixed(3)} ` +
      `strategy=${scene.speedStrategy || "uniform"} priority=${scene.renderPriority || "normal"} ` +
      `anchors=${(scene.keyMoments || []).map((m) => m.toFixed(3)).join(",") || "none"} ` +
      `segments=${segments.length} speeds=${segmentText}`
  );
}

async function renderScene(inputVideo, scene) {
  const voiceWav = resolveVoiceWav(scene.id);

  if (voiceWav) {
    log(`[VoiceWAV] Scene ${scene.id}: dùng file voice ${path.basename(voiceWav)}`);
  }

  if (shouldTemporalWarp(scene)) {
    return renderTemporalWarpScene(inputVideo, scene, voiceWav);
  }

  const outputPath = sceneOutputPath(scene);
  const hasAudio = voiceWav ? false : hasAudioStream(inputVideo);

  const buildArgs = (s) => {
    if (voiceWav) {
      // Trường hợp 1: Có WAV voice — ghép WAV, pad silence nếu ngắn hơn duration_s, cắt nếu dài hơn
      return [
        "-hide_banner",
        "-y",
        "-ss",
        s.start.toFixed(3),
        "-i",
        inputVideo,
        "-i",
        voiceWav,
        "-t",
        s.duration.toFixed(3),
        "-filter_complex",
        `${buildVideoFilters(s)}[vout_wav];[1:a]apad=whole_dur=${s.duration.toFixed(3)},atrim=end=${s.duration.toFixed(3)},asetpts=PTS-STARTPTS[aout_wav]`,
        "-map",
        "[vout_wav]",
        "-map",
        "[aout_wav]",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-r",
        String(TARGET.fps),
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        outputPath,
      ];
    } else if (hasAudio) {
      // Trường hợp 2: Video gốc có audio — giữ nguyên
      return [
        "-hide_banner",
        "-y",
        "-ss",
        s.start.toFixed(3),
        "-i",
        inputVideo,
        "-t",
        s.duration.toFixed(3),
        "-vf",
        buildVideoFilters(s),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-r",
        String(TARGET.fps),
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        outputPath,
      ];
    } else {
      // Trường hợp 3: Không có WAV, không có audio gốc — chèn silent audio
      return [
        "-hide_banner",
        "-y",
        "-ss",
        s.start.toFixed(3),
        "-i",
        inputVideo,
        "-t",
        s.duration.toFixed(3),
        "-f",
        "lavfi",
        "-i",
        `anullsrc=channel_layout=stereo:sample_rate=44100:duration=${s.duration.toFixed(3)}`,
        "-vf",
        buildVideoFilters(s),
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-r",
        String(TARGET.fps),
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        outputPath,
      ];
    }
  };

  const args = buildArgs(scene);

  try {
    await run("ffmpeg", args, `render ${scene.id}`);
  } catch (error) {
    if (scene.textEffect !== "none" || getEffectName(scene.advancedEffect) !== "none") {
      log(`WARN: Scene ${scene.id} lỗi effect, render lại không effect.`);
      const fallbackScene = { ...scene, textEffect: "none", advancedEffect: normalizeAdvancedEffect("none") };
      await run("ffmpeg", buildArgs(fallbackScene), `render fallback ${scene.id}`);
      return outputPath;
    }

    throw error;
  }

  return outputPath;
}

async function renderTemporalWarpScene(inputVideo, scene, voiceWav = null) {
  const outputPath = sceneOutputPath(scene);
  const segments = buildTemporalSegments(scene);
  logTemporalWarp(scene, segments);

  if (segments.length === 0) {
    log(`WARN: Temporal warp không tạo được segment cho ${scene.id}, render scene thường.`);
    return renderScene(inputVideo, { ...scene, keyMoments: [], sourceDuration: scene.duration });
  }

  const buildArgs = (s) => {
    if (voiceWav) {
      // Trường hợp 1: Có WAV voice — nhúng apad vào filter_complex để pad silence cho đủ duration_s
      return [
        "-hide_banner",
        "-y",
        "-ss",
        s.start.toFixed(3),
        "-i",
        inputVideo,
        "-t",
        (s.sourceDuration || s.duration).toFixed(3),
        "-i",
        voiceWav,
        "-filter_complex",
        `${buildTemporalWarpFilterComplex(s, segments)};[1:a]apad=whole_dur=${s.duration.toFixed(3)},atrim=end=${s.duration.toFixed(3)},asetpts=PTS-STARTPTS[aout_wav]`,
        "-map",
        "[vout]",
        "-map",
        "[aout_wav]",
        "-t",
        s.duration.toFixed(3),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-r",
        String(TARGET.fps),
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        outputPath,
      ];
    } else {
      // Trường hợp 2: Không có WAV — dùng silent audio (anullsrc)
      return [
        "-hide_banner",
        "-y",
        "-ss",
        s.start.toFixed(3),
        "-i",
        inputVideo,
        "-t",
        (s.sourceDuration || s.duration).toFixed(3),
        "-f",
        "lavfi",
        "-i",
        `anullsrc=channel_layout=stereo:sample_rate=44100:duration=${s.duration.toFixed(3)}`,
        "-filter_complex",
        buildTemporalWarpFilterComplex(s, segments),
        "-map",
        "[vout]",
        "-map",
        "1:a",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-r",
        String(TARGET.fps),
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        outputPath,
      ];
    }
  };

  const filterScene = { ...scene, temporalWarp: true };
  const args = buildArgs(filterScene);

  try {
    await run("ffmpeg", args, `render temporal ${scene.id}`);
  } catch (error) {
    if (scene.textEffect !== "none" || getEffectName(scene.advancedEffect) !== "none") {
      log(`WARN: Temporal scene ${scene.id} lỗi effect, render lại temporal không effect.`);
      const fallbackScene = {
        ...scene,
        temporalWarp: true,
        textEffect: "none",
        advancedEffect: normalizeAdvancedEffect("none"),
      };
      await run("ffmpeg", buildArgs(fallbackScene), `render temporal fallback ${scene.id}`);
      return outputPath;
    }

    throw error;
  }

  return outputPath;
}

function buildTemporalWarpFilterComplex(scene, segments) {
  const segmentFilters = segments.map((segment) => {
    const speed = Math.max(0.05, segment.speed);
    return `[0:v]trim=start=${segment.from.toFixed(3)}:end=${segment.to.toFixed(
      3
    )},setpts=(PTS-STARTPTS)/${speed.toFixed(5)}[tw${segment.index}]`;
  });

  const concatInput = segments.map((segment) => `[tw${segment.index}]`).join("");
  const concatFilter =
    segments.length === 1
      ? `${concatInput}null[twcat]`
      : `${concatInput}concat=n=${segments.length}:v=1:a=0[twcat]`;

  return [...segmentFilters, concatFilter, `[twcat]${buildVideoFilters(scene)}[vout]`].join(";");
}

async function concatScenes(sceneFiles, outputPath) {
  const listPath = path.join(TEMP_DIR, `${videoId}_concat.txt`);
  const listContent = sceneFiles
    .map((filePath) => `file '${filePath.replace(/'/g, "'\\''")}'`)
    .join("\n");

  fs.writeFileSync(listPath, `${listContent}\n`);

  try {
    await run(
      "ffmpeg",
      [
        "-hide_banner",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c",
        "copy",
        outputPath,
      ],
      "concat scenes"
    );
  } catch (error) {
    log("WARN: concat copy lỗi, thử concat encode lại.");
    await run(
      "ffmpeg",
      [
        "-hide_banner",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-r",
        String(TARGET.fps),
        "-pix_fmt",
        "yuv420p",
        "-an",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      "concat scenes re-encode"
    );
  }
}

async function concatScenesWithTransitions(sceneFiles, scenes, outputPath) {
  const steps = computeXfadeOffsets(scenes);
  const filterComplexStr = buildTransitionFilterComplex(sceneFiles.length, steps);

  const args = ["-hide_banner", "-y"];
  for (const file of sceneFiles) {
    args.push("-i", file);
  }

  args.push(
    "-filter_complex",
    filterComplexStr,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-r",
    String(TARGET.fps),
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ac",
    "2",
    "-ar",
    "44100",
    "-movflags",
    "+faststart",
    outputPath
  );

  await run("ffmpeg", args, "concat scenes with transitions");
}

async function assertFfmpeg() {
  try {
    await run("ffmpeg", ["-version"], "check ffmpeg");
  } catch (error) {
    fail("Không chạy được ffmpeg. Hãy cài ffmpeg và đảm bảo command ffmpeg nằm trong PATH.", error);
  }
}

function cleanupTempDir() {
  try {
    if (!fs.existsSync(TEMP_DIR)) return;
    for (const entry of fs.readdirSync(TEMP_DIR)) {
      // Giữ lại fontconfig cache để ffmpeg render nhanh hơn ở lần sau
      if (entry === "fontconfig") continue;
      const fullPath = path.join(TEMP_DIR, entry);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
    log(`[Cleanup] Đã xóa file tạm trong temp/`);
  } catch (err) {
    log(`[Cleanup] WARN: Không xóa được temp: ${err.message}`);
  }
}

async function renderCurrentProject() {
  const recentEffectAnalysis = initializeEffectLearning(LOG_DIR, { limit: 8 });
  fs.writeFileSync(logPath, "");

  log(`Project detected: ${videoId}`);
  log(`Render started: project=${videoId}`);
  if (workflow.enabled) {
    log(`Workflow incoming/archive enabled project=${videoId}`);
  } else {
    log(`Compatibility mode enabled project=${videoId}`);
  }
  log(`Timeline: ${timelinePath}`);
  log(
    `[EffectLearning] recent_logs=${recentEffectAnalysis.files_read.length} ` +
      `learned_effects=${getLearnedEffectsPath()}`
  );

  const timeline = normalizeTimeline(loadTimeline(timelinePath));
  const inputVideo = resolveInputVideo(timeline);
  const scenes = buildRenderScenes(normalizeScenes(timeline));
  const outputPath = resolveOutputPath(timeline);
  workflow.timeline = timeline;
  workflow.inputVideo = inputVideo;
  workflow.outputPath = outputPath;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  log(`Source files found: video=${inputVideo} timeline=${timelinePath}`);
  log(`Input video: ${inputVideo}`);
  log(`Số scene render: ${scenes.length}`);
  log(`Output: ${outputPath}`);
  log(`Audio enabled: ${AUDIO_ENABLED} (giữ audio input, encode AAC cho concat)`);

  const sceneFiles = [];
  const advancedEffectsUsed = [];
  for (const scene of scenes) {
    const textEffect = resolveTextEffect(scene.textEffect);
    const advancedEffect = resolveAdvancedEffect(scene.advancedEffect);
    const motionPlan = buildMotionPlan(scene, advancedEffect);
    advancedEffectsUsed.push(advancedEffect);
    logEffectLearning(advancedEffect);
    log(
      `Render scene ${scene.index + 1}/${scenes.length}: ${scene.id} ` +
        `start=${scene.start}s duration=${scene.duration}s ` +
        `text_effect=${formatEffectLog(textEffect)} advanced_effect=${formatEffectLog(advancedEffect)}`
    );
    logSemanticMotionPlan(scene, advancedEffect, motionPlan);
    sceneFiles.push(await renderScene(inputVideo, scene));
  }

  if (hasAnyTransitions(scenes)) {
    log("[Transition] Có ít nhất 1 transition_out hợp lệ, sử dụng concatScenesWithTransitions.");
    await concatScenesWithTransitions(sceneFiles, scenes, outputPath);
  } else {
    log("[Transition] Không có transition_out, dùng concatScenes thông thường.");
    await concatScenes(sceneFiles, outputPath);
  }
  writeEffectAnalyticsReport(createEffectAnalytics(advancedEffectsUsed));
  log(`Render completed: project=${videoId} output=${outputPath}`);

  // Đồng bộ Google Sheet khi render thành công
  try {
    const videoMeta = timeline.video_meta || {};
    const captionText = `${videoMeta.description || ""} ${(videoMeta.hashtags || []).map((h) => `#${h}`).join(" ")}`.trim();
    const effectsUsed = [...new Set(scenes.map((s) => s.advanced_effect?.name).filter(Boolean))].join(", ");
    const shortDur = scenes.reduce((acc, s) => acc + (Number(s.duration) || 0), 0);

    await syncProjectToSheet({
      projectId: videoId,
      status: "🎬 Rendered",
      inputFile: inputVideo,
      title: videoMeta.title || "",
      captionHashtags: captionText,
      originalDuration: "",
      shortDuration: `${shortDur.toFixed(1)}s`,
      sceneCount: scenes.length,
      hookScore: scenes[0]?.hook_strength || "",
      effectsSummary: effectsUsed,
      outputFile: outputPath,
      createdAt: "",
      renderedAt: new Date().toISOString().replace("T", " ").substring(0, 16),
    });

    await syncAnalyticsToSheet();
    log("[GoogleSheet] Đã đồng bộ trạng thái 🎬 Rendered và Analytics sang Google Sheet & CSV Backup.");
  } catch (sheetErr) {
    log(`WARN: Lỗi đồng bộ Google Sheet: ${sheetErr.message}`);
  }

  cleanupTempDir();
  archiveSuccessfulRender(workflow, log);
}

function logSemanticMotionPlan(scene, effect, motionPlan) {
  const semantic = effect.semantic || normalizeAdvancedEffect(scene.advancedEffect);
  log(
    `[SemanticMotion] scene=${scene.id} ` +
      `intent=${semantic.intent || "none"} mood=${semantic.mood || "none"} ` +
      `pacing=${semantic.pacing || "none"} focus=${semantic.focus || "product"} ` +
      `camera_motion=${semantic.camera_motion || "static"} intensity=${
        semantic.intensity === null ? "auto" : semantic.intensity
      } ` +
      `motion_plan=${JSON.stringify(summarizeMotionPlan(motionPlan))}`
  );
}

function logEffectLearning(effect) {
  if (!effect.learning) return;

  const matched = effect.learning.matchedKeyword || "";
  log(
    `[EffectLearning] requested="${effect.requestedName}" ` +
      `matched_keyword="${matched}" mapped="${effect.learning.mapped}" ` +
      `source="${effect.learning.source}"`
  );

  if (effect.learning.suggestAlias) {
    log(
      `[EffectLearning] suggest_alias requested="${effect.requestedName}" ` +
        `mapped="${effect.learning.mapped}" count=${effect.learning.count}`
    );
  }
}

function writeEffectAnalyticsReport(report) {
  const reportPath = path.join(EFFECT_ANALYTICS_DIR, `${videoId}_effect_analytics.json`);
  fs.mkdirSync(EFFECT_ANALYTICS_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  log(`[EffectAnalytics] report=${reportPath} ${JSON.stringify(report)}`);
}

async function main() {
  ensureDirs();
  fs.writeFileSync(logPath, "");

  const requestedProject = getRequestedProject();
  const projects = requestedProject ? [requestedProject] : discoverIncomingProjects();

  if (!projects.length) {
    log(`Không tìm thấy project hợp lệ trong incoming: ${INCOMING_DIR}`);
    return;
  }

  await assertFfmpeg();
  bootstrapEffectStatsIfNeeded(LOG_DIR);

  for (const project of projects) {
    configureProject(project);
    try {
      await renderCurrentProject();
    } catch (error) {
      handleProjectFailure(error);
      if (requestedProject) {
        throw error;
      }
    } finally {
      updateEffectStatsFromLog(logPath);
    }
  }
}

function handleProjectFailure(error) {
  try {
    syncProjectToSheet({
      projectId: videoId,
      status: "❌ Failed",
      inputFile: "",
      title: "",
      captionHashtags: "",
      originalDuration: "",
      shortDuration: "",
      sceneCount: "",
      hookScore: "",
      effectsSummary: "",
      outputFile: "",
      createdAt: "",
      renderedAt: new Date().toISOString().replace("T", " ").substring(0, 16),
    });
  } catch {}

  try {
    cleanupTempDir();
    archiveFailedRender(workflow, log);
    log(`ERROR: Render thất bại project=${videoId}`);
    log(error.stack || String(error));
  } catch (archiveError) {
    log("ERROR: Không thể move source sang failed.");
    log(archiveError.stack || String(archiveError));
    log(error.stack || String(error));
  }
}

main().catch(() => {
  process.exit(1);
});
