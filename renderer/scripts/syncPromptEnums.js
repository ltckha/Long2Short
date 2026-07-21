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
const PROMPT_PATHS = [
  path.join(ROOT, "renderer", "prompts", "long2short_generator_prompt.md"),
  path.join(ROOT, "renderer", "prompts", "short2short_generator_prompt.md"),
];

const SECTION_START = "<!-- ENUM_VALID_VALUES:START -->";
const SECTION_END = "<!-- ENUM_VALID_VALUES:END -->";

const FIELD_LABELS = {
  intent: "advanced_effect.intent",
  mood: "advanced_effect.mood",
  pacing: "advanced_effect.pacing",
  focus: "advanced_effect.focus",
  camera_motion: "advanced_effect.camera_motion",
  transition_type: "transition_out.type",
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

const BACKUP_DIR = path.join(ROOT, "renderer", "prompts", "backups");

function backupPromptFile(promptPath) {
  try {
    if (!fs.existsSync(promptPath)) return;

    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    const baseName = path.basename(promptPath, ".md");
    const backupName = `${baseName}.backup_${timestamp}.md`;
    const backupPath = path.join(BACKUP_DIR, backupName);

    fs.copyFileSync(promptPath, backupPath);
    console.log(`[sync-prompt] Đã tạo bản backup riêng cho ${baseName}: ${backupName}`);

    // Giữ tối đa 10 bản backup mới nhất cho riêng từng loại prompt
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith(`${baseName}.backup_`) && f.endsWith(".md"))
      .map((f) => {
        const filePath = path.join(BACKUP_DIR, f);
        return { name: f, path: filePath, mtime: fs.statSync(filePath).mtimeMs };
      });

    if (files.length > 10) {
      files.sort((a, b) => a.mtime - b.mtime);
      const toDeleteCount = files.length - 10;
      for (let i = 0; i < toDeleteCount; i++) {
        fs.unlinkSync(files[i].path);
        console.log(`[sync-prompt] Đã tự động dọn dẹp bản backup cũ: ${files[i].name}`);
      }
    }
  } catch (err) {
    console.warn(`[sync-prompt] WARN: Lỗi tạo backup: ${err.message}`);
  }
}

function main() {
  if (!fs.existsSync(ENUMS_PATH)) {
    console.error(`[ERROR] Không tìm thấy file enum: ${ENUMS_PATH}`);
    process.exit(1);
  }

  const enums = JSON.parse(fs.readFileSync(ENUMS_PATH, "utf8"));
  const newSection = buildEnumSection(enums);

  for (const promptPath of PROMPT_PATHS) {
    if (!fs.existsSync(promptPath)) {
      console.warn(`[sync-prompt] WARN: Bỏ qua file prompt không tồn tại: ${promptPath}`);
      continue;
    }

    let prompt = fs.readFileSync(promptPath, "utf8");

    if (prompt.includes(SECTION_START) && prompt.includes(SECTION_END)) {
      const startIdx = prompt.indexOf(SECTION_START);
      const endIdx = prompt.indexOf(SECTION_END) + SECTION_END.length;
      const before = prompt.slice(0, startIdx).trimEnd();
      const after = prompt.slice(endIdx).trimStart();
      prompt = `${before}\n${newSection}\n${after}`;
      console.log(`[sync-prompt] Đã cập nhật section ENUM_VALID_VALUES trong: ${path.basename(promptPath)}`);
    } else {
      prompt = `${prompt.trimEnd()}\n${newSection}\n`;
      console.log(`[sync-prompt] Đã thêm section ENUM_VALID_VALUES vào cuối: ${path.basename(promptPath)}`);
    }

    backupPromptFile(promptPath);
    fs.writeFileSync(promptPath, prompt, "utf8");
  }

  console.log("");
  console.log("[sync-prompt] Enum hiện tại:");
  for (const [key, values] of Object.entries(enums)) {
    console.log(`   ${FIELD_LABELS[key] || key}: ${values.length} giá trị`);
  }
}

main();
