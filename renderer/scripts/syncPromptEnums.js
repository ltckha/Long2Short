#!/usr/bin/env node
/**
 * syncPromptEnums.js
 * Đọc renderer/config/effectEnums.json và inject danh sách giá trị hợp lệ
 * vào renderer/prompts/timeline_generator_prompt.md.
 *
 * Chạy: npm run sync-prompt (từ thư mục renderer/)
 * Hoặc: node renderer/scripts/syncPromptEnums.js (từ thư mục gốc dự án)
 *
 * PROTOCOL: Để cập nhật enum, chỉnh sửa renderer/config/effectEnums.json
 * rồi chạy lệnh này. Không chỉnh sửa trực tiếp timeline_generator_prompt.md.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const ENUMS_PATH = path.join(ROOT, "renderer", "config", "effectEnums.json");
const PROMPT_PATH = path.join(ROOT, "renderer", "prompts", "timeline_generator_prompt.md");

const SECTION_START = "<!-- ENUM_VALID_VALUES:START -->";
const SECTION_END = "<!-- ENUM_VALID_VALUES:END -->";

const FIELD_LABELS = {
  intent: "advanced_effect.intent",
  mood: "advanced_effect.mood",
  pacing: "advanced_effect.pacing",
  focus: "advanced_effect.focus",
  camera_motion: "advanced_effect.camera_motion",
};

function buildEnumSection(enums) {
  const lines = [
    "",
    SECTION_START,
    "",
    "## GIÁ TRỊ HỢP LỆ CHO CÁC TRƯỜNG ADVANCED_EFFECT",
    "",
    "Bắt buộc chỉ sử dụng các giá trị dưới đây. Mọi giá trị ngoài danh sách sẽ bị hệ thống render từ chối:",
    "",
  ];

  for (const [key, values] of Object.entries(enums)) {
    const label = FIELD_LABELS[key] || key;
    lines.push(`**${label}**: ${values.map((v) => `\`${v}\``).join(", ")}`);
    lines.push("");
  }

  lines.push(SECTION_END);
  return lines.join("\n");
}

function main() {
  if (!fs.existsSync(ENUMS_PATH)) {
    console.error(`[ERROR] Không tìm thấy file enum: ${ENUMS_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(PROMPT_PATH)) {
    console.error(`[ERROR] Không tìm thấy file prompt: ${PROMPT_PATH}`);
    process.exit(1);
  }

  const enums = JSON.parse(fs.readFileSync(ENUMS_PATH, "utf8"));
  let prompt = fs.readFileSync(PROMPT_PATH, "utf8");

  const newSection = buildEnumSection(enums);

  if (prompt.includes(SECTION_START) && prompt.includes(SECTION_END)) {
    // Thay thế section hiện có
    const startIdx = prompt.indexOf(SECTION_START);
    const endIdx = prompt.indexOf(SECTION_END) + SECTION_END.length;
    const before = prompt.slice(0, startIdx).trimEnd();
    const after = prompt.slice(endIdx).trimStart();
    prompt = `${before}\n${newSection}\n${after}`;
    console.log("[sync-prompt] Đã cập nhật section ENUM_VALID_VALUES trong prompt.");
  } else {
    // Lần đầu: append vào cuối file
    prompt = `${prompt.trimEnd()}\n${newSection}\n`;
    console.log("[sync-prompt] Đã thêm section ENUM_VALID_VALUES vào cuối prompt.");
  }

  fs.writeFileSync(PROMPT_PATH, prompt, "utf8");

  console.log("[sync-prompt] ✅ Hoàn tất. File đã được cập nhật:");
  console.log(`   ${PROMPT_PATH}`);
  console.log("");
  console.log("[sync-prompt] Enum hiện tại:");
  for (const [key, values] of Object.entries(enums)) {
    console.log(`   ${FIELD_LABELS[key] || key}: ${values.length} giá trị`);
  }
}

main();
