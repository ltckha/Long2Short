#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const ROOT = path.resolve(__dirname, "..", "..");
const EFFECTS_DIR = path.join(ROOT, "effects");
const LEARNED_STYLES_DIR = path.join(EFFECTS_DIR, "learned_styles");
const LEARNED_EFFECTS_PATH = path.join(EFFECTS_DIR, "learned_effects.json");
const PROMPT_PATH = path.join(ROOT, "renderer", "prompts", "video_style_learning_prompt.md");

async function generateContentWithRetryFallback(ai, models, contents, config) {
  let lastError;
  for (const model of models) {
    try {
      console.log(`[AI] Thử nghiệm mô hình: ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents,
        config,
      });
      console.log(`[AI] Mô hình ${model} phản hồi thành công!`);
      return response;
    } catch (err) {
      console.warn(`[AI] Mô hình ${model} gặp lỗi: ${err.message}`);
      lastError = err;
    }
  }
  throw lastError;
}

function updateLearnedEffectsRegistry(novelEffects) {
  if (!Array.isArray(novelEffects) || novelEffects.length === 0) return;
  try {
    fs.mkdirSync(EFFECTS_DIR, { recursive: true });
    let existing = {};
    if (fs.existsSync(LEARNED_EFFECTS_PATH)) {
      try {
        existing = JSON.parse(fs.readFileSync(LEARNED_EFFECTS_PATH, "utf8"));
      } catch {}
    }

    let addedCount = 0;
    for (const eff of novelEffects) {
      if (!eff || !eff.effect_name) continue;
      const key = String(eff.effect_name).toLowerCase().trim();
      const mapped = String(eff.camera_motion || eff.visual_intent || "zoom_soft").toLowerCase().trim();
      if (!existing[key]) {
        existing[key] = mapped;
        addedCount++;
      }
    }

    if (addedCount > 0) {
      fs.writeFileSync(LEARNED_EFFECTS_PATH, JSON.stringify(existing, null, 2) + "\n", "utf8");
      console.log(`[LearnedEffects] Đã tự động cập nhật thêm ${addedCount} hiệu ứng mới vào: ${LEARNED_EFFECTS_PATH}`);
    }
  } catch (err) {
    console.warn(`[LearnedEffects] WARN: Không thể cập nhật learned_effects.json: ${err.message}`);
  }
}

async function main() {
  const videoPathArg = process.argv[2];
  if (!videoPathArg) {
    console.error("❌ Lỗi: Vui lòng truyền đường dẫn video mẫu viral.");
    process.exit(1);
  }

  const absoluteVideoPath = path.resolve(videoPathArg);
  if (!fs.existsSync(absoluteVideoPath)) {
    console.error(`❌ Lỗi: Không tìm thấy file video tại: ${absoluteVideoPath}`);
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ Lỗi: Chưa thiết lập biến môi trường GEMINI_API_KEY.");
    process.exit(1);
  }

  if (!fs.existsSync(PROMPT_PATH)) {
    console.error(`❌ Lỗi: Không tìm thấy file system prompt học phong cách tại: ${PROMPT_PATH}`);
    process.exit(1);
  }

  const systemInstruction = fs.readFileSync(PROMPT_PATH, "utf8");
  const videoName = path.basename(absoluteVideoPath, path.extname(absoluteVideoPath));
  console.log(`[StyleLearner] Đang phân tích video viral mẫu: ${videoName}`);

  const ai = new GoogleGenAI({ apiKey });

  let uploadResult;
  try {
    console.log(`[Upload] Đang upload video lên Gemini File API...`);
    uploadResult = await ai.files.upload({
      file: absoluteVideoPath,
      mimeType: "video/mp4",
    });
    console.log(`[Upload] Tải lên thành công: ${uploadResult.name}`);
  } catch (uploadErr) {
    console.error("❌ Lỗi: Không thể upload video lên File API:", uploadErr.message);
    process.exit(1);
  }

  try {
    console.log("[Poll] Đang đợi Gemini xử lý video...");
    let fileState = uploadResult;
    let attempts = 0;
    while (fileState.state === "PROCESSING") {
      attempts++;
      console.log(`[Poll] (#${attempts}) Đang xử lý video, đợi 5s...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      fileState = await ai.files.get({ name: uploadResult.name });
    }

    if (fileState.state !== "ACTIVE") {
      throw new Error(`Xử lý file thất bại. Trạng thái: ${fileState.state}`);
    }
    console.log("[Poll] Video sẵn sàng phân tích!");

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
        {
          text: "Hãy phân tích kỹ video mẫu này và xuất ra JSON Style Profile & Few-shot examples theo đúng cấu trúc system prompt.",
        },
      ],
      {
        systemInstruction,
        responseMimeType: "application/json",
      }
    );

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Không nhận được phản hồi từ AI.");
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(responseText);
    } catch (jsonErr) {
      console.log("Raw response:", responseText);
      throw new Error(`Phản hồi AI không phải JSON hợp lệ: ${jsonErr.message}`);
    }

    // Đảm bảo thư mục effects/learned_styles/ tồn tại
    fs.mkdirSync(LEARNED_STYLES_DIR, { recursive: true });

    const styleNameRaw = parsedResult.style_profile?.name || videoName;
    const safeStyleFileName = styleNameRaw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toLowerCase() + ".json";

    const outputPath = path.join(LEARNED_STYLES_DIR, safeStyleFileName);
    fs.writeFileSync(outputPath, JSON.stringify(parsedResult, null, 2), "utf8");

    // Cập nhật learned_effects.json với các hiệu ứng mới phát hiện
    updateLearnedEffectsRegistry(parsedResult.learned_novel_effects);

    console.log("");
    console.log("==================================================");
    console.log("🎉 HỌC PHONG CÁCH VIDEO VIRAL HOÀN TẤT!");
    console.log("==================================================");
    console.log(`📌 Tên Phong Cách : ${parsedResult.style_profile?.name || "N/A"}`);
    console.log(`⏱️ Thời Lượng Scene: ~${parsedResult.style_profile?.average_scene_duration_s || 0}s`);
    console.log(`⚡ Nhịp Độ Pacing  : ${parsedResult.style_profile?.pacing_speed || "N/A"}`);
    console.log(`🎯 Chiến Thuật Hook: ${parsedResult.style_profile?.hook_strategy || "N/A"}`);
    console.log(`📁 File Phong Cách : ${outputPath}`);
    console.log("==================================================");

    if (Array.isArray(parsedResult.learned_novel_effects) && parsedResult.learned_novel_effects.length > 0) {
      console.log("🔥 ĐÃ HỌC ĐƯỢC CÁC HIỆU ỨNG MỚI ĐỘC ĐÁO:");
      for (const eff of parsedResult.learned_novel_effects) {
        console.log(`   - ${eff.effect_name}: ${eff.description || eff.visual_intent}`);
      }
      console.log("==================================================");
    }
  } catch (err) {
    console.error("❌ Lỗi khi phân tích phong cách video:", err.message);
    process.exit(1);
  } finally {
    try {
      await ai.files.delete({ name: uploadResult.name });
      console.log("[Cleanup] Đã dọn dẹp file rác trên Gemini File API.");
    } catch {}
  }
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
  process.exit(1);
});
