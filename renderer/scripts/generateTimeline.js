#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

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

async function main() {
  const videoPathArg = process.argv[2];
  if (!videoPathArg) {
    console.error("Lỗi: Vui lòng truyền đường dẫn video gốc.");
    console.log("Cú pháp: node generateTimeline.js <path_to_video> [project_id]");
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

  const projectId = process.argv[3] || `ai_${generateTimestampId()}`;
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
      console.log(`[Poll] (#${attempts}) File đang được xử lý, đợi 10s...`);
      await new Promise((resolve) => setTimeout(resolve, 10000));
      fileState = await ai.files.get({ name: uploadResult.name });
    }

    if (fileState.state !== "ACTIVE") {
      throw new Error(`Xử lý file thất bại. Trạng thái file: ${fileState.state}`);
    }
    console.log("[Poll] Video đã sẵn sàng hoạt động!");

    if (!fs.existsSync(PROMPT_PATH)) {
      throw new Error(`Không tìm thấy file prompt system tại: ${PROMPT_PATH}`);
    }
    const systemInstruction = fs.readFileSync(PROMPT_PATH, "utf8");

    console.log("[AI] Đang yêu cầu gemini-3.5-flash phân tích và sinh timeline JSON...");
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          fileData: {
            fileUri: fileState.uri,
            mimeType: fileState.mimeType
          }
        },
        "Hãy thực hiện phân tích video trên và trả về kịch bản Timeline JSON chi tiết theo đúng cấu trúc quy chuẩn."
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      }
    });

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

    // Đảm bảo thư mục incoming tồn tại
    fs.mkdirSync(INCOMING_DIR, { recursive: true });

    // Ghi file JSON timeline
    const timelineOutputPath = path.join(INCOMING_DIR, `${projectId}.json`);
    fs.writeFileSync(timelineOutputPath, JSON.stringify(timelineJson, null, 2), "utf8");
    console.log(`[Timeline] Đã tạo file kịch bản JSON: ${timelineOutputPath}`);

    // Sao chép video gốc vào incoming để sẵn sàng render
    const videoOutputPath = path.join(INCOMING_DIR, `${projectId}.mp4`);
    fs.copyFileSync(absoluteVideoPath, videoOutputPath);
    console.log(`[Video] Đã sao chép video gốc sang: ${videoOutputPath}`);

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
