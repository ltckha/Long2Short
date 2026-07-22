#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");
const { getLocalDateTime, syncProjectToSheet, syncScenesToSheet } = require("./googleSheetsSync");

const ROOT = path.resolve(__dirname, "..", "..");
const INCOMING_DIR = path.join(ROOT, "incoming");
const PROMPTS_DIR = path.join(ROOT, "renderer", "prompts");
const PROMPT_PATH = path.join(PROMPTS_DIR, "timeline_generator_prompt.md");

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    video_meta: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        hashtags: {
          type: "ARRAY",
          items: { type: "STRING" }
        }
      },
      required: ["title", "description", "hashtags"]
    },
    timeline: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          scene_id: { type: "STRING" },
          scene_type: { type: "STRING", enum: ["hook", "body", "transition", "conclusion"] },
          start_s: { type: "NUMBER" },
          end_s: { type: "NUMBER" },
          duration_s: { type: "NUMBER" },
          title: { type: "STRING" },
          story_importance: { type: "NUMBER" },
          key_moments: {
            type: "ARRAY",
            items: { type: "NUMBER" }
          },
          speed_strategy: { type: "STRING", enum: ["uniform", "adaptive", "ramp", "jumpcut"] },
          render_priority: { type: "STRING", enum: ["keep", "compress"] },
          subtitle: { type: "STRING" },
          subtitle_style: { type: "STRING", enum: ["hook_bold", "neon_glow", "framed_card", "gold_caption", "cta_red"] },
          text_position: { type: "STRING", enum: ["top", "center", "bottom"] },
          voice: { type: "STRING" },
          visual_cue: { type: "STRING" },
          text_effect: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING", enum: ["Pop-up", "Bounce", "Typewriter", "Slide In", "Glow"] },
              description: { type: "STRING" }
            },
            required: ["name", "description"]
          },
          advanced_effect: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              intent: { type: "STRING" },
              mood: { type: "STRING" },
              pacing: { type: "STRING" },
              focus: { type: "STRING" },
              camera_motion: { type: "STRING" },
              intensity: { type: "NUMBER" },
              description: { type: "STRING" }
            },
            required: ["name", "intent", "mood", "pacing", "focus", "camera_motion", "intensity", "description"]
          },
          transition_out: {
            type: "OBJECT",
            properties: {
              type: { type: "STRING" },
              duration: { type: "NUMBER" }
            },
            required: ["type", "duration"]
          },
          hook_strength: { type: "NUMBER" },
          visual_energy: { type: "NUMBER" },
          retention_score: { type: "NUMBER" },
          confidence: { type: "NUMBER" },
          include: { type: "BOOLEAN" }
        },
        required: [
          "scene_id", "scene_type", "start_s", "end_s", "duration_s", "title",
          "story_importance", "key_moments", "speed_strategy", "render_priority",
          "subtitle", "subtitle_style", "text_position", "voice", "visual_cue",
          "text_effect", "advanced_effect", "hook_strength", "visual_energy",
          "retention_score", "confidence", "include"
        ]
      }
    }
  },
  required: ["video_meta", "timeline"]
};

function generateTimestampId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function generateContentWithRetryFallback(ai, models, contents, config) {
  let lastError;

  for (const modelName of models) {
    console.log(`[AI] Đang thử sử dụng mô hình '${modelName}'...`);

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config,
      });

      if (response && response.text) {
        console.log(`[AI] ✅ Mô hình '${modelName}' đã sinh dữ liệu thành công!`);
        return response;
      }
    } catch (err) {
      lastError = err;
      const isUnavailable =
        err.message &&
        (err.message.includes("503") ||
          err.message.includes("UNAVAILABLE") ||
          err.message.includes("high demand") ||
          err.message.includes("429"));

      if (isUnavailable) {
        console.warn(`[AI] ⚠️ Mô hình '${modelName}' bị báo quá tải (503/429). Chuyển sang mô hình dự phòng kế tiếp...`);
      } else {
        console.warn(`[AI] ⚠️ Mô hình '${modelName}' gặp lỗi: ${err.message}. Thử mô hình kế tiếp...`);
      }
    }
  }

  throw lastError || new Error("Tất cả các mô hình Gemini trong danh sách đều quá tải hoặc thất bại.");
}

function validateAndFixTimelineTimestamps(timelineJson, videoPath) {
  if (!timelineJson || !Array.isArray(timelineJson.timeline)) return timelineJson;

  let videoDuration = 0;
  try {
    const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
    const out = require("child_process").execSync(cmd, { encoding: "utf8" }).trim();
    videoDuration = parseFloat(out) || 0;
  } catch {}

  if (videoDuration <= 0) return timelineJson;

  let fixedCount = 0;
  const scenes = timelineJson.timeline;

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    let start = Number(s.start_s ?? s.start) || 0;
    let end = Number(s.end_s ?? s.end) || 0;

    // Phát hiện và tự động sửa lỗi AI nhầm mốc M:SS -> MSS (Ví dụ 1:15 -> 115)
    if (start >= videoDuration && start >= 100) {
      const min = Math.floor(start / 100);
      const sec = start % 100;
      if (sec < 60) {
        const converted = min * 60 + sec;
        if (converted < videoDuration) {
          console.log(
            `[AutoCorrect] ⚠️ Phát hiện AI nhầm mốc thời gian M:SS (${min}:${sec < 10 ? "0" + sec : sec}). Tự động chuyển start_s từ ${start}s -> ${converted}s`
          );
          start = converted;
          fixedCount++;
        }
      }
    }

    if (end >= videoDuration && end >= 100) {
      const min = Math.floor(end / 100);
      const sec = end % 100;
      if (sec < 60) {
        const converted = min * 60 + sec;
        if (converted <= videoDuration + 1) {
          console.log(
            `[AutoCorrect] ⚠️ Phát hiện AI nhầm mốc thời gian M:SS (${min}:${sec < 10 ? "0" + sec : sec}). Tự động chuyển end_s từ ${end}s -> ${converted}s`
          );
          end = converted;
          fixedCount++;
        }
      }
    }

    // Clamp an toàn nếu vẫn vượt quá độ dài video gốc
    if (start >= videoDuration - 0.5) {
      start = Math.max(0, videoDuration - 5);
      fixedCount++;
    }
    if (end > videoDuration) {
      end = videoDuration;
      fixedCount++;
    }

    s.start_s = Number(start.toFixed(2));
    s.end_s = Number(end.toFixed(2));
  }

  if (fixedCount > 0) {
    console.log(`[AutoCorrect] ✅ Đã tự động hiệu chỉnh an toàn ${fixedCount} mốc thời gian trong kịch bản JSON!`);
  }

  return timelineJson;
}

async function main() {
  const nonFlagArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const videoPathArg = nonFlagArgs[0];
  if (!videoPathArg) {
    console.error("Lỗi: Vui lòng truyền đường dẫn video gốc.");
    process.exit(1);
  }

  const absoluteVideoPath = path.resolve(videoPathArg);
  if (!fs.existsSync(absoluteVideoPath)) {
    console.error(`Lỗi: Không tìm thấy file video tại: ${absoluteVideoPath}`);
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Lỗi: Chưa thiết lập biến môi trường GEMINI_API_KEY.");
    process.exit(1);
  }

  const defaultProjectId = path.basename(absoluteVideoPath, path.extname(absoluteVideoPath));
  const projectId = nonFlagArgs[1] || defaultProjectId;
  console.log(`[Project] Khởi tạo dự án: ${projectId}`);

  const ai = new GoogleGenAI({ apiKey });

  let uploadResult;
  try {
    console.log(`[Upload] Đang upload video lên Gemini File API: ${absoluteVideoPath}...`);
    uploadResult = await ai.files.upload({
      file: absoluteVideoPath,
      mimeType: "video/mp4",
    });
    console.log(`[Upload] Đã tải lên file: ${uploadResult.name} (URI: ${uploadResult.uri})`);
  } catch (uploadErr) {
    console.error("Lỗi: Không thể upload video lên File API:", uploadErr.message);
    process.exit(1);
  }

  try {
    console.log("[Poll] Đang đợi Gemini xử lý video...");
    let fileState = uploadResult;
    let attempts = 0;
    while (fileState.state === "PROCESSING") {
      attempts++;
      console.log(`[Poll] (#${attempts}) File đang được xử lý, đợi 5s...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      fileState = await ai.files.get({ name: uploadResult.name });
    }

    if (fileState.state !== "ACTIVE") {
      throw new Error(`Xử lý file thất bại. Trạng thái file: ${fileState.state}`);
    }
    console.log("[Poll] Video đã sẵn sàng hoạt động!");

  // Phân tích tham số mode: node generateTimeline.js <path_to_video> [project_id] [--mode=short2short|long2short]
  let mode = null;
  const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
  if (modeArg) {
    mode = modeArg.split("=")[1].toLowerCase().trim();
  }

  // Tự động nhận diện Mode dựa trên độ dài video nếu không truyền cờ --mode
  if (!mode) {
    let dur = null;
    try {
      const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPathArg}"`;
      const out = require("child_process").execSync(cmd, { encoding: "utf8" }).trim();
      dur = parseFloat(out);
    } catch {}

    if (dur && Number.isFinite(dur)) {
      if (dur < 55) {
        mode = "short2short";
      } else if (dur > 90) {
        mode = "long2short";
      } else {
        mode = "short2short";
      }
    } else {
      mode = "long2short";
    }
  }

  const isShort2Short = mode === "short2short";
  const pipelineMode = isShort2Short ? "Short2Short" : "Long2Short";
  const promptFileName = isShort2Short ? "short2short_generator_prompt.md" : "long2short_generator_prompt.md";
  const promptPath = path.join(PROMPTS_DIR, promptFileName);

  console.log(`[Mode] Chế độ chạy: ${pipelineMode} (Prompt: ${promptFileName})`);

  if (!fs.existsSync(promptPath)) {
    throw new Error(`Không tìm thấy file prompt system tại: ${promptPath}`);
  }
  const systemInstruction = fs.readFileSync(promptPath, "utf8");

    console.log("[AI] Đang gửi yêu cầu phân tích video sang Gemini AI...");
    const candidateModels = ["gemini-3.5-flash", "gemini-3.0-flash", "gemini-2.5-flash", "gemini-2.0-flash"];
    const response = await generateContentWithRetryFallback(
      ai,
      candidateModels,
      [
        {
          fileData: {
            fileUri: fileState.uri,
            mimeType: fileState.mimeType,
          },
        },
        "Hãy thực hiện phân tích video trên và trả về kịch bản Timeline JSON chi tiết theo đúng cấu trúc quy chuẩn.",
      ],
      {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      }
    );

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Không nhận được dữ liệu phản hồi từ mô hình.");
    }

    // Kiểm tra và parse JSON
    let timelineJson;
    try {
      timelineJson = JSON.parse(responseText);
    } catch (jsonErr) {
      console.log("[AI] Dữ liệu thô từ AI:", responseText);
      throw new Error(`Phản hồi không phải là JSON hợp lệ: ${jsonErr.message}`);
    }

    // Tự động kiểm tra và hiệu chỉnh mốc thời gian an toàn
    timelineJson = validateAndFixTimelineTimestamps(timelineJson, absoluteVideoPath);

    // Đảm bảo thư mục incoming tồn tại
    fs.mkdirSync(INCOMING_DIR, { recursive: true });

    // Đo thời lượng video gốc
    let origDurSec = null;
    try {
      const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${absoluteVideoPath}"`;
      const out = require("child_process").execSync(cmd, { encoding: "utf8" }).trim();
      origDurSec = parseFloat(out);
    } catch {}

    // Gán thuộc tính pipeline_mode, original_duration_s, created_at và input_file vào video_meta
    const nowCreatedAt = getLocalDateTime();
    timelineJson.video_meta = timelineJson.video_meta || {};
    timelineJson.video_meta.pipeline_mode = pipelineMode;
    timelineJson.video_meta.created_at = nowCreatedAt;
    timelineJson.video_meta.input_file = absoluteVideoPath;
    if (origDurSec && Number.isFinite(origDurSec)) {
      timelineJson.video_meta.original_duration_s = Number(origDurSec.toFixed(1));
    }

    // Ghi file JSON timeline
    const timelineOutputPath = path.join(INCOMING_DIR, `${projectId}.json`);
    fs.writeFileSync(timelineOutputPath, JSON.stringify(timelineJson, null, 2), "utf8");
    console.log(`[Timeline] Đã tạo file kịch bản JSON: ${timelineOutputPath}`);

    // Sao chép video gốc vào incoming để sẵn sàng render
    const videoOutputPath = path.join(INCOMING_DIR, `${projectId}.mp4`);
    fs.copyFileSync(absoluteVideoPath, videoOutputPath);
    console.log(`[Video] Đã sao chép video gốc sang: ${videoOutputPath}`);

    // Đồng bộ thông tin kịch bản sang Google Sheet & Local CSV Backup
    try {
      const videoMeta = timelineJson.video_meta || {};
      const scenes = timelineJson.timeline || [];
      const shortDur = scenes.reduce((acc, s) => acc + (Number(s.duration_s) || 0), 0);
      const effectsUsed = [...new Set(scenes.map((s) => s.advanced_effect?.name).filter(Boolean))].join(", ");

      let origDurSec = null;
      try {
        const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${absoluteVideoPath}"`;
        const out = require("child_process").execSync(cmd, { encoding: "utf8" }).trim();
        origDurSec = parseFloat(out);
      } catch {}
      const origDurationFormatted = origDurSec && Number.isFinite(origDurSec) ? `${origDurSec.toFixed(1)}s` : "";

      await syncProjectToSheet({
        projectId,
        pipelineMode,
        status: "🤖 Timeline Ready",
        inputFile: absoluteVideoPath,
        title: videoMeta.title || "",
        captionHashtags: captionText,
        originalDuration: origDurationFormatted,
        shortDuration: `${shortDur.toFixed(1)}s`,
        sceneCount: scenes.length,
        hookScore: scenes[0]?.hook_strength || "",
        effectsSummary: effectsUsed,
        outputFile: "",
        createdAt: nowCreatedAt,
        renderedAt: "",
      });

      await syncScenesToSheet(projectId, scenes);
      console.log("[GoogleSheet] Đã đồng bộ kịch bản mới sang Google Sheet & CSV Backup thành công!");
    } catch (sheetErr) {
      console.warn(`[GoogleSheet] WARN: Không thể đồng bộ Google Sheet: ${sheetErr.message}`);
    }

    console.log(`\n🎉 Thành công! Dự án '${projectId}' đã sẵn sàng để render.`);
    console.log(`Chạy lệnh: node renderer/scripts/render.js ${projectId}`);

  } catch (err) {
    console.error("\n[Error] Lỗi trong quá trình tạo timeline:", err.message);
  } finally {
    // Luôn dọn dẹp file tạm trên File API để tránh lãng phí dung lượng
    if (uploadResult && uploadResult.name) {
      try {
        console.log(`[Cleanup] Đang xóa file tạm trên Gemini File API (${uploadResult.name})...`);
        await ai.files.delete({ name: uploadResult.name });
        console.log("[Cleanup] Đã dọn dẹp file tạm thành công.");
      } catch (cleanupErr) {
        console.warn(`[Cleanup] Cảnh báo: Không thể xóa file tạm trên File API: ${cleanupErr.message}`);
      }
    }
  }
}

main().catch((err) => {
  console.error("Unhandled rejection:", err);
  process.exit(1);
});
