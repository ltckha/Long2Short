const { resolveLearnedAdvancedEffect } = require("./effectLearning");
const _enumsRaw = require("../config/effectEnums.json");


function normalizeEffectKey(value) {
  if (!value) return "none";
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function fmt(value) {
  return Number(value).toFixed(3);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const ADVANCED_EFFECT_ENUMS = Object.fromEntries(
  Object.entries(_enumsRaw).map(([key, values]) => [key, new Set(values)])
);


function normalizeAdvancedEffect(effect) {
  if (!effect) {
    return {
      name: "none",
      intent: null,
      mood: null,
      pacing: null,
      focus: "product",
      camera_motion: "static",
      intensity: null,
      description: "",
      hasSemanticMetadata: false,
      hasFocusMetadata: false,
      hasCameraMotionMetadata: false,
    };
  }

  if (typeof effect === "string") {
    return {
      name: effect || "none",
      intent: null,
      mood: null,
      pacing: null,
      focus: "product",
      camera_motion: "static",
      intensity: null,
      description: "",
      hasSemanticMetadata: false,
      hasFocusMetadata: false,
      hasCameraMotionMetadata: false,
    };
  }

  if (typeof effect !== "object") return normalizeAdvancedEffect("none");

  if (typeof effect.hasSemanticMetadata === "boolean") {
    return {
      name: stringValue(effect.name, "none"),
      intent: enumValue(effect.intent, ADVANCED_EFFECT_ENUMS.intent),
      mood: enumValue(effect.mood, ADVANCED_EFFECT_ENUMS.mood),
      pacing: enumValue(effect.pacing, ADVANCED_EFFECT_ENUMS.pacing),
      intensity: numericEffectIntensity(effect.intensity),
      focus: enumValue(effect.focus, ADVANCED_EFFECT_ENUMS.focus) || "product",
      camera_motion: enumValue(effect.camera_motion ?? effect.cameraMotion, ADVANCED_EFFECT_ENUMS.camera_motion) || "static",
      description: stringValue(effect.description, ""),
      hasSemanticMetadata: Boolean(effect.hasSemanticMetadata),
      hasFocusMetadata: Boolean(effect.hasFocusMetadata),
      hasCameraMotionMetadata: Boolean(effect.hasCameraMotionMetadata),
    };
  }

  const focus = enumValue(effect.focus, ADVANCED_EFFECT_ENUMS.focus);
  const cameraMotion = enumValue(
    effect.camera_motion ?? effect.cameraMotion,
    ADVANCED_EFFECT_ENUMS.camera_motion
  );
  const normalized = {
    name: stringValue(effect.name, "none"),
    intent: enumValue(effect.intent, ADVANCED_EFFECT_ENUMS.intent),
    mood: enumValue(effect.mood, ADVANCED_EFFECT_ENUMS.mood),
    pacing: enumValue(effect.pacing, ADVANCED_EFFECT_ENUMS.pacing),
    intensity: numericEffectIntensity(effect.intensity),
    focus: focus || "product",
    camera_motion: cameraMotion || "static",
    description: stringValue(effect.description, ""),
    hasFocusMetadata: Boolean(focus),
    hasCameraMotionMetadata: Boolean(cameraMotion),
  };

  normalized.hasSemanticMetadata = Boolean(
    normalized.intent ||
      normalized.mood ||
      normalized.pacing ||
      normalized.hasFocusMetadata ||
      normalized.hasCameraMotionMetadata ||
      normalized.intensity !== null
  );

  return normalized;
}

function stringValue(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function enumValue(value, allowed) {
  if (value === undefined || value === null) return null;
  const key = String(value).trim().toLowerCase();
  return allowed.has(key) ? key : null;
}

function numericEffectIntensity(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return clamp(number, 0, 1);
}

function fadeAlpha(cue, fadeDuration = 0.28) {
  const start = fmt(cue.start);
  const fadeEnd = fmt(cue.start + fadeDuration);
  return `if(lt(t\\,${fadeEnd})\\,0.04+0.96*(t-${start})/${fadeDuration}\\,1)`;
}

const TEXT_EFFECT_REGISTRY = {
  none: {
    displayName: "None",
    build: () => ({}),
  },

  popup: {
    displayName: "Pop-up",
    build: ({ cue, baseY }) => ({
      y: `'${baseY}+if(lt(t\\,${fmt(
        cue.start + 0.32
      )})\\,(1-(t-${fmt(cue.start)})/0.32)*10\\,0)'`,
      extraOptions: [`alpha='${fadeAlpha(cue, 0.32)}'`],
    }),
  },

  glow: {
    displayName: "Glow",
    build: () => ({
      bordercolor: "0x080808@0.28",
      shadowcolor: "0x000000@0.54",
      shadowx: "0",
      shadowy: "7",
      boxcolor: "0x050505@0.24",
    }),
  },

  bounce: {
    displayName: "Bounce",
    build: ({ baseY }) => ({
      y: `'${baseY}-if(lt(mod(t\\,2.4)\\,0.48)\\,sin(mod(t\\,2.4)/0.48*3.14159)*5\\,0)'`,
    }),
  },

  typewriter: {
    displayName: "Typewriter",
    typewriter: true,
    build: () => ({}),
  },

  typing: {
    alias: "typewriter",
  },

  slidein: {
    displayName: "Slide In",
    build: ({ cue, baseY }) => ({
      x: `'if(lt(t\\,${fmt(cue.start + 0.36)})\\,w-((t-${fmt(
        cue.start
      )})/0.36)*(w-(w-text_w)/2+18)\\,(w-text_w)/2)'`,
      y: baseY,
      extraOptions: [`alpha='${fadeAlpha(cue, 0.28)}'`],
    }),
  },

  slide: {
    alias: "slidein",
  },

  fade: {
    displayName: "Fade",
    build: ({ cue }) => ({
      extraOptions: [
        `alpha='if(lt(t\\,${fmt(cue.start + 0.35)})\\,(t-${fmt(
          cue.start
        )})/0.35\\,if(lt(t\\,${fmt(cue.end - 0.35)})\\,1\\,(${fmt(cue.end)}-t)/0.35))'`,
      ],
    }),
  },
};

const ADVANCED_EFFECT_REGISTRY = {
  none: {
    displayName: "None",
    build: () => [],
  },

  shake: {
    displayName: "Shake",
    build: ({ target }) => [
      `crop=${target.width - 12}:${target.height - 12}:x='6+3*sin(18*t)':y='6+3*cos(16*t)'`,
      `scale=${target.width}:${target.height}`,
    ],
  },

  zoomin: {
    displayName: "Zoom In",
    build: ({ scene, target }) => [
      `scale=w='trunc(${target.width}*(1+0.018*t/${fmt(scene.duration)})/2)*2':h='trunc(${
        target.height
      }*(1+0.018*t/${fmt(scene.duration)})/2)*2':eval=frame`,
      `crop=${target.width}:${target.height}`,
    ],
  },

  zoom: {
    alias: "zoomin",
  },

  zoomsoft: {
    alias: "zoomin",
  },

  softzoom: {
    alias: "zoomin",
  },

  cinematiczoom: {
    alias: "overshootzoom",
  },

  flash: {
    displayName: "Flash",
    build: () => [
      "drawbox=x=0:y=0:w=iw:h=ih:color=white@0.08:t=fill:enable='lt(t,0.10)'",
    ],
  },

  speedup: {
    displayName: "Speed Up",
    build: () => ["setpts=PTS/1.18"],
  },

  speedramp: {
    displayName: "Speed Ramp",
    build: () => ["setpts=PTS/1.18"],
  },

  speedrampup: {
    alias: "speedramp",
  },

  speedrampfast: {
    alias: "speedramp",
  },

  viralfast: {
    alias: "speedramp",
  },

  speedpulse: {
    displayName: "Speed Pulse",
    build: () => ["setpts=PTS/1.12"],
  },

  slowdown: {
    displayName: "Slow Down",
    build: () => ["setpts=PTS*1.08"],
  },

  punchzoom: {
    displayName: "Punch Zoom",
    build: () => [],
  },

  overshootzoom: {
    displayName: "Overshoot Zoom",
    build: () => [],
  },

  snapzoom: {
    displayName: "Snap Zoom",
    build: () => [],
  },

  driftcam: {
    displayName: "Drift Cam",
    build: () => [],
  },

  macropush: {
    displayName: "Macro Push",
    build: () => [],
  },

  glitch: {
    displayName: "Glitch",
    build: () => ["rgbashift=rh=4:bh=-4:enable='lt(mod(t,0.65),0.07)'"],
  },

  rgbshift: {
    alias: "glitch",
  },
};

function resolveFromRegistry(registry, name) {
  const requestedKey = normalizeEffectKey(name);
  let effect = registry[requestedKey];
  let resolvedKey = requestedKey;

  if (effect && effect.alias) {
    resolvedKey = effect.alias;
    effect = registry[resolvedKey];
  }

  if (!effect) {
    return {
      ...registry.none,
      key: "none",
      requestedKey,
      requestedName: name || "none",
      fallback: requestedKey !== "none",
    };
  }

  return {
    ...effect,
    key: resolvedKey,
    requestedKey,
    requestedName: name || effect.displayName,
    fallback: false,
  };
}

function resolveTextEffect(name) {
  return resolveFromRegistry(TEXT_EFFECT_REGISTRY, name);
}

function resolveAdvancedEffect(input) {
  const normalized = normalizeAdvancedEffect(input);
  const name = normalized.name;
  const effect = {
    ...resolveFromRegistry(ADVANCED_EFFECT_REGISTRY, name),
    semantic: normalized,
  };
  if (!effect.fallback) return effect;

  const learned = resolveLearnedAdvancedEffect(name, ADVANCED_EFFECT_REGISTRY);
  if (!learned) return effect;

  const mapped = resolveFromRegistry(ADVANCED_EFFECT_REGISTRY, learned.mapped);
  if (mapped.fallback) return effect;

  return {
    ...mapped,
    requestedKey: effect.requestedKey,
    requestedName: name || effect.requestedName,
    fallback: false,
    learning: learned,
    semantic: normalized,
  };
}

function buildAdvancedFilters(scene, target) {
  const effect = resolveAdvancedEffect(scene.advancedEffect);
  const plan = buildMotionPlan(scene, effect);
  return buildFiltersFromMotionPlan(plan, scene, target);
}

function buildFiltersFromMotionPlan(plan, scene, target) {
  const filters = [];
  const zoom = deriveZoomOptions(plan);

  if (plan.speed) filters.push(...speedRampFilters(plan.speed));
  if (zoom) filters.push(...zoomFilters(zoom, scene, target));
  if (plan.shake) filters.push(...shakeFilters(plan.shake, target));
  if (plan.flash) filters.push(...flashFilters(plan.flash));
  if (plan.glow) filters.push(...glowFilters(plan.glow));
  if (plan.contrast || plan.sharpen) filters.push(...detailFilters(plan));
  if (plan.rgbSplit) filters.push(...rgbSplitFilters(plan.rgbSplit));

  return filters;
}

function deriveZoomOptions(plan) {
  if (!plan.zoom && !plan.drift && !plan.pulse && !plan.snapBoost) return null;

  const style =
    plan.zoomStyle ||
    (plan.snapBoost ? "snap" : null) ||
    (plan.pulse ? "pulse" : null) ||
    (plan.drift ? "drift" : null) ||
    (plan.zoom && plan.zoom.type) ||
    "push_in";
  const base = plan.zoom ? plan.zoom.intensity || 0 : 0.35;
  const boosted = base + (plan.snapBoost || 0) * 0.28 + (plan.pulse || 0) * 0.18;

  return {
    ...(plan.zoom || {}),
    type: style,
    intensity: clamp(Math.max(plan.zoomStrength || 0, boosted), 0.05, 1),
    drift: plan.drift || 0,
    pulse: plan.pulse || 0,
    snapBoost: plan.snapBoost || 0,
  };
}

function buildMotionPlan(scene, effect) {
  const semanticEffect = effect.semantic || normalizeAdvancedEffect(scene.advancedEffect);
  const semantic = semanticText(scene, effect);
  const intensity = semanticEffect.intensity ?? sceneIntensity(scene);
  const plan = {
    speed: null,
    zoom: null,
    shake: null,
    flash: null,
    glow: null,
    sharpen: 0,
    contrast: 0,
    drift: 0,
    pulse: 0,
    snapBoost: 0,
    rgbSplit: null,
    zoomStyle: null,
    zoomStrength: 0,
    easing: "smooth",
    source: semanticEffect.hasSemanticMetadata ? "semantic" : "legacy",
  };
  const effectKey = effect.key || "none";

  if (semanticEffect.hasSemanticMetadata) {
    applySemanticMotionPlan(plan, semanticEffect, intensity);
  }

  if (plan.source === "legacy" && (["speedup", "speedramp", "speedrampup"].includes(effectKey) || hasAny(semantic, [
    "speedup",
    "speedramp",
    "tuạnh",
    "tuanhanh",
    "nhanh",
  ]))) {
    plan.speed = { type: "speed_up", intensity };
  }

  if (plan.source === "legacy" && (effectKey === "slowdown" || hasAny(semantic, ["slow", "slowdown", "cham"]))) {
    plan.speed = { type: "slow_down", intensity };
  }

  if (plan.source === "legacy" && (effectKey === "speedpulse" || hasAny(semantic, ["bamnut", "snap", "impact", "xoa", "trongtron"]))) {
    plan.speed = { type: "pulse", intensity };
  }

  if (plan.source === "legacy" && (["zoomin", "zoom", "punchzoom"].includes(effectKey) || hasAny(semantic, ["zoom", "can", "canh", "nhan", "barcode"]))) {
    plan.zoom = { type: "punch", intensity };
  }

  if (plan.source === "legacy" && (effectKey === "overshootzoom" || hasAny(semantic, ["lo dien", "lodien", "wow", "batngo"]))) {
    plan.zoom = { type: "overshoot", intensity };
  }

  if (plan.source === "legacy" && effectKey === "snapzoom") {
    plan.zoom = { type: "snap", intensity };
  }

  if (plan.source === "legacy" && (effectKey === "driftcam" || hasAny(semantic, ["xoay", "rotate", "pan", "luot"]))) {
    plan.zoom = plan.zoom || { type: "drift", intensity };
  }

  if (plan.source === "legacy" && hasAny(semantic, ["smooth transition", "transition", "chuyen canh", "chuyen"])) {
    plan.zoom = plan.zoom || { type: "drift", intensity: Math.max(0.45, intensity * 0.82) };
    plan.flash = plan.flash || { intensity: Math.max(0.4, intensity * 0.55) };
  }

  if (plan.source === "legacy" && (effectKey === "macropush" || hasAny(semantic, ["macro", "closeup", "close", "sat", "day sat"]))) {
    plan.zoom = { type: "macro", intensity };
  }

  if (plan.source === "legacy" && (effectKey === "shake" || hasAny(semantic, ["xe", "boc", "keo", "rut", "cat", "rach", "snap", "impact", "dutkhoat"]))) {
    plan.shake = { intensity };
  }

  if (plan.source === "legacy" && (effectKey === "flash" || hasAny(semantic, ["flash", "nhay", "lo dien", "lodien", "xoa", "trong tron", "trongtron"]))) {
    plan.flash = { intensity };
  }

  if (
    effectKey === "glitch" ||
    (plan.flash && intensity > 0.82) ||
    (semanticEffect.mood === "aggressive" && ["fast", "pulse"].includes(semanticEffect.pacing)) ||
    (semanticEffect.intent === "viral_fast" && intensity > 0.7)
  ) {
    plan.rgbSplit = { intensity: Math.min(intensity, 0.9) };
  }


  if (["hook", "satisfying"].includes(normalizeSemanticText(scene.scene_type || scene.sceneType))) {
    plan.zoom = plan.zoom || { type: "punch", intensity: Math.max(intensity, 0.72) };
    plan.flash = plan.flash || { intensity: Math.max(intensity, 0.68) };
  }

  if (effectKey === "none" && scene.openingHook) {
    plan.zoom = { type: "punch", intensity: Math.max(intensity, 0.8) };
    plan.flash = { intensity: Math.max(intensity, 0.72) };
  }

  if (scene.temporalWarp) {
    plan.speed = null;
  }

  return plan;
}

function applySemanticMotionPlan(plan, effect, intensity) {
  const strong = Math.max(0.62, intensity);
  const soft = Math.max(0.35, intensity * 0.72);

  if (effect.intent === "viral_fast") {
    plan.speed = { type: "speed_up", intensity: strong };
    setZoomPlan(plan, "snap", strong);
    plan.flash = { intensity: soft };
    plan.shake = { intensity: soft * 0.72 };
    plan.easing = "sharp";
  }

  if (effect.intent === "reveal_impact") {
    setZoomPlan(plan, "overshoot", strong);
    plan.flash = { intensity: strong };
    plan.shake = { intensity: soft * 0.65 };
    plan.easing = "impact";
  }

  if (effect.intent === "premium_showcase") {
    setZoomPlan(plan, "push_in", soft);
    plan.glow = { intensity: soft };
    plan.easing = "smooth";
  }

  if (effect.intent === "luxury_soft") {
    setZoomPlan(plan, "drift", soft);
    plan.glow = { intensity: Math.max(0.42, soft) };
    plan.easing = "soft";
  }

  if (effect.intent === "dramatic_focus") {
    setZoomPlan(plan, "push_in", strong);
    plan.glow = { intensity: soft * 0.75 };
    plan.easing = "smooth";
  }

  if (effect.intent === "satisfying_cut") {
    plan.speed = { type: "pulse", intensity: soft };
    setZoomPlan(plan, "pulse", soft);
    plan.flash = { intensity: soft * 0.7 };
  }

  if (effect.intent === "energetic_demo") {
    plan.speed = { type: "speed_up", intensity: soft };
    setZoomPlan(plan, "punch", strong);
    plan.shake = { intensity: soft * 0.65 };
  }

  if (effect.intent === "cinematic_transition") {
    setZoomPlan(plan, "drift", soft);
    plan.flash = { intensity: soft * 0.65 };
    plan.glow = { intensity: soft * 0.6 };
  }

  if (effect.intent === "tension_build") {
    setZoomPlan(plan, "push_in", soft * 0.85);
    plan.speed = { type: "slow_down", intensity: soft * 0.65 };
    plan.glow = strongerPlan(plan.glow, soft * 0.55);
    plan.easing = "smooth";
  }

  if (effect.intent === "emotional_pause") {
    plan.speed = { type: "slow_down", intensity: soft * 0.45 };
    plan.glow = strongerPlan(plan.glow, soft * 0.72);
    plan.drift = clamp((plan.drift || 0) + 0.15, 0, 1);
    plan.easing = "soft";
  }

  applyMoodModifiers(plan, effect, intensity);
  applyPacingModifiers(plan, effect, intensity);
  applyFocusModifiers(plan, effect, intensity);
  applyCameraMotionOverrides(plan, effect, intensity);
}

function applyMoodModifiers(plan, effect, intensity) {
  const mood = effect.mood;
  if (mood === "aggressive") {
    plan.shake = strongerPlan(plan.shake, intensity * 0.8);
    plan.flash = strongerPlan(plan.flash, intensity * 0.75);
  }
  if (mood === "premium") plan.glow = strongerPlan(plan.glow, intensity * 0.78);
  if (mood === "soft") {
    plan.glow = strongerPlan(plan.glow, intensity * 0.55);
    if (!plan.zoom) setZoomPlan(plan, "drift", intensity * 0.45);
    plan.easing = "soft";
  }
  if (mood === "energetic") plan.speed = plan.speed || { type: "speed_up", intensity };
  if (mood === "satisfying") plan.speed = plan.speed || { type: "pulse", intensity: intensity * 0.7 };
  if (mood === "playful" && !plan.zoom) setZoomPlan(plan, "pulse", intensity * 0.68);
  if (mood === "emotional" && !plan.zoom) setZoomPlan(plan, "drift", intensity * 0.58);
  if (mood === "dramatic") setZoomPlan(plan, "push_in", intensity);
}

function applyPacingModifiers(plan, effect, intensity) {
  const pacing = effect.pacing;
  if (pacing === "slow") plan.speed = { type: "slow_down", intensity: intensity * 0.58 };
  if (pacing === "medium") plan.speed = plan.speed || null;
  if (pacing === "fast") plan.speed = { type: "speed_up", intensity };
  if (pacing === "pulse") plan.speed = { type: "pulse", intensity };
  if (pacing === "dynamic") {
    plan.speed = plan.speed || { type: "speed_up", intensity: intensity * 0.78 };
    plan.shake = strongerPlan(plan.shake, intensity * 0.52);
  }
}

function applyFocusModifiers(plan, effect, intensity) {
  if (!effect.hasSemanticMetadata) return;

  const focus = effect.focus;
  if (focus === "product") {
    addZoomStrength(plan, 0.1, "push_in", intensity * 0.55);
    plan.glow = strongerPlan(plan.glow, 0.05);
  }

  if (focus === "texture") {
    plan.sharpen = clamp(plan.sharpen + 0.3, 0, 1);
    plan.contrast = clamp(plan.contrast + 0.15, 0, 1);
    plan.glow = strongerPlan(plan.glow, 0.1);
    if (!plan.speed) plan.speed = { type: "slow_down", intensity: Math.max(0.35, intensity * 0.58) };
    setZoomPlan(plan, "macro", Math.max(plan.zoomStrength, intensity * 0.72));
  }

  if (focus === "packaging") {
    plan.drift = clamp(plan.drift + 0.2, 0, 1);
    addZoomStrength(plan, 0.05, "drift", intensity * 0.65);
  }

  if (focus === "reveal") {
    plan.flash = strongerPlan(plan.flash, 0.25);
    plan.pulse = clamp(plan.pulse + 0.2, 0, 1);
    setZoomPlan(plan, "overshoot", Math.max(plan.zoomStrength, intensity * 0.82));
  }

  if (focus === "hand_action") {
    plan.speed = strongerPlan(plan.speed, 0.15, "speed_up");
    plan.snapBoost = clamp(plan.snapBoost + 0.2, 0, 1);
    setZoomPlan(plan, "snap", Math.max(plan.zoomStrength, intensity * 0.66));
  }

  if (focus === "logo") {
    addZoomStrength(plan, 0.08, "push_in", intensity * 0.55);
    plan.sharpen = clamp(plan.sharpen + 0.12, 0, 1);
  }

  if (focus === "reveal" || ["dramatic", "premium"].includes(effect.mood)) {
    plan.sharpen = clamp(plan.sharpen + 0.2, 0, 1);
    plan.contrast = clamp(plan.contrast + 0.1, 0, 1);
  }
}

function applyCameraMotionOverrides(plan, effect, intensity) {
  const cameraMotion = effect.camera_motion;
  if (!cameraMotion || cameraMotion === "static") return;

  if (cameraMotion === "push_in") {
    addZoomStrength(plan, 0.15, "push_in", intensity);
  }

  if (cameraMotion === "push_out") {
    setZoomPlan(plan, "push_out", Math.max(plan.zoomStrength, intensity));
  }

  if (cameraMotion === "drift") {
    plan.drift = clamp(plan.drift + 0.3, 0, 1);
    plan.easing = "cinematic";
    setZoomPlan(plan, "drift", Math.max(plan.zoomStrength, intensity * 0.72));
  }

  if (cameraMotion === "snap") {
    plan.snapBoost = clamp(plan.snapBoost + 0.4, 0, 1);
    plan.easing = "snap";
    setZoomPlan(plan, "snap", Math.max(plan.zoomStrength, intensity));
  }

  if (cameraMotion === "overshoot") {
    plan.easing = "overshoot";
    setZoomPlan(plan, "overshoot", Math.max(plan.zoomStrength, intensity));
  }

  if (cameraMotion === "pulse") {
    plan.pulse = clamp(plan.pulse + 0.4, 0, 1);
    setZoomPlan(plan, "pulse", Math.max(plan.zoomStrength, intensity * 0.78));
  }
}

function strongerPlan(existing, intensity, type) {
  if (!existing) return type ? { type, intensity } : { intensity };
  return {
    ...existing,
    ...(type ? { type } : {}),
    intensity: Math.max(existing.intensity || 0, intensity),
  };
}

function setZoomPlan(plan, type, intensity) {
  const zoomIntensity = clamp(intensity, 0.05, 1);
  plan.zoom = { type, intensity: zoomIntensity };
  plan.zoomStyle = type;
  plan.zoomStrength = Math.max(plan.zoomStrength || 0, zoomIntensity);
}

function addZoomStrength(plan, amount, type, fallbackIntensity) {
  const current = plan.zoom ? plan.zoom.intensity || 0 : fallbackIntensity || 0.45;
  const next = clamp(Math.max(current, fallbackIntensity || 0) + amount, 0.05, 1);
  setZoomPlan(plan, type || plan.zoomStyle || "push_in", next);
}

function sceneIntensity(scene) {
  const visualEnergy = numericScore(scene.visual_energy ?? scene.visualEnergy, 0.55);
  const retentionScore = numericScore(scene.retention_score ?? scene.retentionScore, visualEnergy);
  const hookStrength = numericScore(scene.hook_strength ?? scene.hookStrength, visualEnergy);
  const confidence = numericScore(scene.confidence, 0.65);
  return clamp(
    visualEnergy * 0.36 + retentionScore * 0.32 + hookStrength * 0.22 + confidence * 0.1,
    0.35,
    0.95
  );
}

function numericScore(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(number, 0, 1);
}

function semanticText(scene, effect) {
  const parts = [
    effect.requestedName,
    scene.scene_type,
    scene.sceneType,
    scene.visual_cue,
    scene.visualCue,
    scene.title,
    scene.subtitle,
  ];
  const advancedEffect = scene.advanced_effect || scene.advancedEffect;
  if (advancedEffect && typeof advancedEffect === "object") {
    const normalized = normalizeAdvancedEffect(advancedEffect);
    parts.push(
      normalized.name,
      normalized.intent,
      normalized.mood,
      normalized.pacing,
      normalized.focus,
      normalized.camera_motion,
      normalized.description
    );
  }
  return normalizeSemanticText(parts.filter(Boolean).join(" "));
}

function normalizeSemanticText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(normalizeSemanticText(keyword)));
}

function speedRampFilters(options) {
  const strength = options.intensity;
  if (options.type === "slow_down") {
    const factor = 1 + 0.06 + strength * 0.08;
    return [`setpts=PTS*${fmt(factor)}`, "fps=30"];
  }

  if (options.type === "pulse") {
    const rate = 1 + 0.08 + strength * 0.12;
    return [`setpts=PTS/${fmt(rate)}`, "fps=30"];
  }

  const rate = 1 + 0.12 + strength * 0.18;
  return [`setpts=PTS/${fmt(rate)}`, "fps=30"];
}

function zoomFilters(options, scene, target) {
  const duration = Math.max(0.1, Number(scene.duration) || 0.1);
  const strength = options.intensity;
  let amount = 0.014 + strength * 0.035;

  if (options.type === "macro") amount = 0.035 + strength * 0.045;
  if (options.type === "snap") amount = 0.026 + strength * 0.04 + (options.snapBoost || 0) * 0.018;
  if (options.type === "drift") amount = 0.018 + strength * 0.02 + (options.drift || 0) * 0.012;
  if (options.type === "overshoot") amount = 0.028 + strength * 0.04;
  if (options.type === "pulse") amount = 0.018 + strength * 0.025 + (options.pulse || 0) * 0.016;

  const scaleExpr = zoomScaleExpression(options.type, amount, duration);
  const filters = [
    `scale=w='trunc(${target.width}*(${scaleExpr})/2)*2':h='trunc(${target.height}*(${scaleExpr})/2)*2':eval=frame`,
  ];

  if (options.type === "drift") {
    const drift = 8 + Math.round(strength * 8) + Math.round((options.drift || 0) * 10);
    filters.push(
      `crop=${target.width}:${target.height}:x='(in_w-${target.width})/2+${drift}*sin(t*0.8)':y='(in_h-${target.height})/2+${Math.round(
        drift * 0.55
      )}*cos(t*0.7)'`
    );
  } else {
    filters.push(`crop=${target.width}:${target.height}`);
  }

  return filters;
}

function zoomScaleExpression(type, amount, duration) {
  if (type === "push_out") {
    return `1+${fmt(amount)}*(1-t/${fmt(duration)})`;
  }

  if (type === "snap") {
    return `1+${fmt(amount)}*if(lt(t\\,0.09)\\,t/0.09\\,1)`;
  }

  if (type === "pulse") {
    return `1+${fmt(amount)}*(0.45+0.55*abs(sin(t*6)))`;
  }

  if (type === "overshoot") {
    return `1+${fmt(amount)}*(1-exp(-4*t/${fmt(duration)}))+${fmt(amount * 0.22)}*sin(t*8)*exp(-3*t/${fmt(duration)})`;
  }

  if (type === "drift") {
    return `1+${fmt(amount)}*t/${fmt(duration)}`;
  }

  if (type === "macro") {
    return `1+${fmt(amount)}*t/${fmt(duration)}`;
  }

  return `1+${fmt(amount)}*if(lt(t\\,0.28)\\,t/0.28\\,1)`;
}

function shakeFilters(options, target) {
  const strength = options.intensity;
  const margin = 14 + Math.round(strength * 20);
  const amp = Math.max(3, Math.round(margin * 0.34));
  const width = target.width - margin;
  const height = target.height - margin;

  return [
    `crop=${width}:${height}:x='${Math.floor(margin / 2)}+${amp}*sin(42*t)*if(lt(t\\,0.42)\\,1-t/0.42\\,0)':y='${Math.floor(
      margin / 2
    )}+${Math.max(2, Math.round(amp * 0.72))}*cos(36*t)*if(lt(t\\,0.42)\\,1-t/0.42\\,0)'`,
    `scale=${target.width}:${target.height}`,
  ];
}

function flashFilters(options) {
  const alpha = 0.06 + options.intensity * 0.12;
  const duration = 0.055 + options.intensity * 0.045;
  return [
    `drawbox=x=0:y=0:w=iw:h=ih:color=white@${fmt(alpha)}:t=fill:enable='lt(t\\,${fmt(duration)})'`,
  ];
}

function rgbSplitFilters(options) {
  const amount = Math.max(1, Math.round(options.intensity * 3));
  return [`rgbashift=rh=${amount}:bh=-${amount}:enable='lt(t\\,0.075)'`];
}

function glowFilters(options) {
  const strength = clamp(options.intensity || 0.4, 0.2, 0.95);
  return [
    `eq=contrast=${fmt(1 + strength * 0.045)}:saturation=${fmt(1 + strength * 0.08)}:brightness=${fmt(
      strength * 0.012
    )}`,
    `unsharp=5:5:${fmt(0.18 + strength * 0.22)}:3:3:${fmt(0.04 + strength * 0.08)}`,
  ];
}

function detailFilters(plan) {
  const contrast = clamp(plan.contrast || 0, 0, 1);
  const sharpen = clamp(plan.sharpen || 0, 0, 1);
  const filters = [];

  if (contrast) {
    filters.push(`eq=contrast=${fmt(1 + contrast * 0.22)}:saturation=${fmt(1 + contrast * 0.08)}`);
  }

  if (sharpen) {
    filters.push(`unsharp=5:5:${fmt(0.18 + sharpen * 0.7)}:3:3:${fmt(0.04 + sharpen * 0.16)}`);
  }

  return filters;
}

function summarizeMotionPlan(plan) {
  return {
    source: plan.source,
    zoomStyle: plan.zoomStyle || (plan.zoom && plan.zoom.type) || null,
    zoomStrength: roundPlanNumber(plan.zoomStrength || (plan.zoom && plan.zoom.intensity) || 0),
    speed: plan.speed ? plan.speed.type : null,
    speedStrength: plan.speed ? roundPlanNumber(plan.speed.intensity) : 0,
    glow: plan.glow ? roundPlanNumber(plan.glow.intensity) : 0,
    flash: plan.flash ? roundPlanNumber(plan.flash.intensity) : 0,
    shake: plan.shake ? roundPlanNumber(plan.shake.intensity) : 0,
    sharpen: roundPlanNumber(plan.sharpen),
    contrast: roundPlanNumber(plan.contrast),
    drift: roundPlanNumber(plan.drift),
    pulse: roundPlanNumber(plan.pulse),
    snapBoost: roundPlanNumber(plan.snapBoost),
    easing: plan.easing,
  };
}

function roundPlanNumber(value) {
  const number = Number(value) || 0;
  return Number(number.toFixed(3));
}

function formatEffectLog(effect) {
  if (effect.learning) {
    return `${effect.requestedName} -> ${effect.learning.mapped}`;
  }
  if (!effect.fallback) return effect.displayName;
  return `${effect.requestedName} -> fallback`;
}

module.exports = {
  buildAdvancedFilters,
  buildFiltersFromMotionPlan,
  buildMotionPlan,
  formatEffectLog,
  normalizeAdvancedEffect,
  resolveAdvancedEffect,
  resolveTextEffect,
  summarizeMotionPlan,
};
