const TRANSITION_REGISTRY = {
  fade: "fade",
  wipe_left: "wipeleft",
  wipe_right: "wiperight",
  slide_up: "slideup",
  circle_open: "circleopen",
  pixelize: "pixelize",
};

function normalizeTransitionOut(scene) {
  if (!scene) return null;
  if (scene.openingHook || (scene.id && String(scene.id).startsWith("opening_hook_"))) {
    return null;
  }
  const raw = scene.transition_out || scene.transitionOut;
  if (!raw) return null;

  let rawType = "fade";
  let rawDuration = 0.4;

  if (typeof raw === "string") {
    rawType = raw.trim().toLowerCase();
  } else if (typeof raw === "object") {
    rawType = String(raw.type || "fade").trim().toLowerCase();
    rawDuration = Number(raw.duration) || 0.4;
  }

  const xfadeType = TRANSITION_REGISTRY[rawType];
  if (!xfadeType) {
    console.warn(`[Transition] Cảnh báo: transition type không hợp lệ "${rawType}", fallback về "fade"`);
    return {
      type: "fade",
      xfadeType: "fade",
      duration: Math.max(0.1, Math.min(1.5, rawDuration)),
    };
  }

  return {
    type: rawType,
    xfadeType,
    duration: Math.max(0.1, Math.min(1.5, rawDuration)),
  };
}

/**
 * computeXfadeOffsets(scenes)
 * Tính toán danh sách transition và offset cho N cảnh theo công thức SPEC.
 *
 * Ví dụ đối chiếu (3 cảnh d1=3.0s, d2=4.0s, d3=3.0s; transition t1=0.4s, t2=0.4s):
 * - xfade thứ 1 (cảnh 0 -> cảnh 1):
 *     offset_0 = d1 - t1 = 3.0 - 0.4 = 2.6s
 *     thời lượng tích lũy sau ghép = d1 + d2 - t1 = 3.0 + 4.0 - 0.4 = 6.6s
 * - xfade thứ 2 (cảnh gộp -> cảnh 2):
 *     offset_1 = accum_1 - t2 = 6.6 - 0.4 = 6.2s
 *     thời lượng tích lũy sau ghép = accum_1 + d3 - t2 = 6.6 + 3.0 - 0.4 = 9.2s
 */
function computeXfadeOffsets(scenes) {
  if (!scenes || scenes.length <= 1) return [];

  const steps = [];
  let accumDuration = Number(scenes[0].duration) || 0;

  for (let i = 0; i < scenes.length - 1; i++) {
    const currentScene = scenes[i];
    const nextScene = scenes[i + 1];
    const nextDuration = Number(nextScene.duration) || 0;

    const trans = normalizeTransitionOut(currentScene);

    if (trans && trans.duration > 0) {
      // Giới hạn thời lượng transition không vượt quá 45% độ dài cảnh để đảm bảo an toàn cho ffmpeg
      const maxAllowedDur = Math.min(accumDuration, nextDuration) * 0.45;
      const effectiveDuration = Math.max(0.05, Math.min(trans.duration, maxAllowedDur));
      const offset = accumDuration - effectiveDuration;

      steps.push({
        fromIndex: i,
        toIndex: i + 1,
        type: trans.type,
        xfadeType: trans.xfadeType,
        duration: effectiveDuration,
        offset: Math.max(0, offset),
      });

      accumDuration = accumDuration + nextDuration - effectiveDuration;
    } else {
      // Ghép nối nối tiếp không có transition (cắt cứng)
      steps.push({
        fromIndex: i,
        toIndex: i + 1,
        type: "none",
        xfadeType: "none",
        duration: 0,
        offset: accumDuration,
      });

      accumDuration = accumDuration + nextDuration;
    }
  }

  return steps;
}

function hasAnyTransitions(scenes) {
  if (!scenes || !Array.isArray(scenes) || scenes.length <= 1) return false;
  for (let i = 0; i < scenes.length - 1; i++) {
    const trans = normalizeTransitionOut(scenes[i]);
    if (trans && trans.duration > 0) return true;
  }
  return false;
}

function buildTransitionFilterComplex(sceneCount, steps) {
  const filters = [];

  // Chuẩn hóa timebase, fps và audio sample rate cho toàn bộ input streams để tránh lỗi lệch timebase trong xfade
  for (let k = 0; k < sceneCount; k++) {
    filters.push(`[${k}:v]fps=30,settb=AVTB[v_in_${k}]`);
    filters.push(`[${k}:a]aresample=44100,asetpts=PTS-STARTPTS[a_in_${k}]`);
  }

  let currV = "v_in_0";
  let currA = "a_in_0";

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const nextV = `v_in_${i + 1}`;
    const nextA = `a_in_${i + 1}`;
    const isLast = i === steps.length - 1;
    const outV = isLast ? "vout" : `v_step_${i}`;
    const outA = isLast ? "aout" : `a_step_${i}`;

    if (step.duration > 0 && step.xfadeType !== "none") {
      filters.push(
        `[${currV}][${nextV}]xfade=transition=${step.xfadeType}:duration=${step.duration.toFixed(3)}:offset=${step.offset.toFixed(3)}[${outV}]`
      );
      filters.push(
        `[${currA}][${nextA}]acrossfade=d=${step.duration.toFixed(3)}:c1=tri:c2=tri[${outA}]`
      );
    } else {
      filters.push(`[${currV}][${nextV}]concat=n=2:v=1:a=0[${outV}]`);
      filters.push(`[${currA}][${nextA}]concat=n=2:v=0:a=1[${outA}]`);
    }

    currV = outV;
    currA = outA;
  }

  return filters.join(";");
}

module.exports = {
  TRANSITION_REGISTRY,
  buildTransitionFilterComplex,
  computeXfadeOffsets,
  hasAnyTransitions,
  normalizeTransitionOut,
};
