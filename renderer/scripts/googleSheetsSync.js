const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const BACKUP_DIR = path.join(ROOT, "renderer", "output", "sheets_backup");
const STATS_PATH = path.join(ROOT, "effects", "effect_success_stats.json");

function getLocalDateTime() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function getWebhookUrl() {
  if (process.env.GOOGLE_SHEET_WEBHOOK_URL) {
    return process.env.GOOGLE_SHEET_WEBHOOK_URL.trim();
  }

  // Thử đọc từ config local env.json
  const configPath = path.join(ROOT, "renderer", "config", "env.json");
  if (fs.existsSync(configPath)) {
    try {
      const conf = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (conf.GOOGLE_SHEET_WEBHOOK_URL) return conf.GOOGLE_SHEET_WEBHOOK_URL.trim();
    } catch {}
  }

  // Thử đọc từ ~/.zshrc hoặc ~/.bash_profile
  const homeDir = process.env.HOME || "/Users/khan";
  const shellFiles = [path.join(homeDir, ".zshrc"), path.join(homeDir, ".bash_profile")];
  for (const sf of shellFiles) {
    if (fs.existsSync(sf)) {
      try {
        const content = fs.readFileSync(sf, "utf8");
        const match = content.match(/GOOGLE_SHEET_WEBHOOK_URL=["']?([^"'\r\n]+)["']?/);
        if (match && match[1]) {
          return match[1].trim();
        }
      } catch {}
    }
  }

  return "";
}

async function sendWebhook(payload) {
  const url = getWebhookUrl();
  if (!url) return false;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (err) {
    console.warn(`[GoogleSheetSync] WARN: Không thể gửi Webhook Google Sheet: ${err.message}`);
    return false;
  }
}

function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function appendCsvLine(filePath, headers, values) {
  ensureBackupDir();
  const fileExists = fs.existsSync(filePath);
  if (!fileExists) {
    fs.writeFileSync(filePath, `${headers.join(",")}\n`, "utf8");
  }

  const escaped = values.map((val) => {
    const str = String(val ?? "").replace(/"/g, '""');
    return `"${str}"`;
  });
  fs.appendFileSync(filePath, `${escaped.join(",")}\n`, "utf8");
}

async function syncProjectToSheet(projectData) {
  // 1. Webhook
  await sendWebhook({
    action: "sync_project",
    project: projectData,
  });

  // 2. Local CSV Backup
  const csvPath = path.join(BACKUP_DIR, "projects_tracker.csv");
  const headers = [
    "Project ID", "Status", "Input File", "Video Title", "Caption & Hashtags",
    "Original Duration", "Short Duration", "Scene Count", "Opening Hook Score",
    "Effects Summary", "Output File", "Created At", "Rendered At"
  ];
  const row = [
    projectData.projectId,
    projectData.status,
    projectData.inputFile,
    projectData.title,
    projectData.captionHashtags,
    projectData.originalDuration,
    projectData.shortDuration,
    projectData.sceneCount,
    projectData.hookScore,
    projectData.effectsSummary,
    projectData.outputFile,
    projectData.createdAt,
    projectData.renderedAt
  ];
  appendCsvLine(csvPath, headers, row);
}

async function syncScenesToSheet(projectId, scenes) {
  if (!scenes || !Array.isArray(scenes)) return;

  // 1. Webhook
  await sendWebhook({
    action: "sync_scenes",
    projectId,
    scenes,
  });

  // 2. Local CSV Backup
  const csvPath = path.join(BACKUP_DIR, "scenes_detail.csv");
  const headers = [
    "Project ID", "Scene ID", "Scene Type", "Time (Start-End)", "Target Duration",
    "Subtitle", "Voice Text", "Visual Cue", "Subtitle Style", "Advanced Effect", "Transition Out"
  ];

  for (const s of scenes) {
    const textEffectName = typeof s.text_effect === "object" ? s.text_effect.name : s.text_effect;
    const advEffectName = typeof s.advanced_effect === "object" ? s.advanced_effect.name : s.advanced_effect;
    const transOutType = s.transition_out ? `${s.transition_out.type} (${s.transition_out.duration}s)` : "none";

    const row = [
      projectId,
      s.scene_id,
      s.scene_type,
      `${s.start_s || 0}s - ${s.end_s || 0}s`,
      `${s.duration_s || 0}s`,
      s.subtitle,
      s.voice,
      s.visual_cue,
      `${s.subtitle_style || "default"} (${s.text_position || "bottom"})`,
      `${advEffectName || "none"} (${s.advanced_effect?.camera_motion || "static"})`,
      transOutType
    ];
    appendCsvLine(csvPath, headers, row);
  }
}

async function syncAnalyticsToSheet() {
  let stats = {};
  try {
    if (fs.existsSync(STATS_PATH)) {
      stats = JSON.parse(fs.readFileSync(STATS_PATH, "utf8"));
    }
  } catch {}

  const analytics = [];
  for (const [key, val] of Object.entries(stats)) {
    if (key === "_meta" || key === "fallback" || key === "none" || typeof val !== "object") continue;
    analytics.push({
      key,
      success: val.success || 0,
      fail: val.fail || 0,
    });
  }

  // 1. Webhook
  await sendWebhook({
    action: "sync_analytics",
    analytics,
  });

  // 2. Local CSV Backup
  const csvPath = path.join(BACKUP_DIR, "effects_analytics.csv");
  const headers = ["Effect Key", "Success Count", "Fail Count", "Success Rate (%)", "Safe Pool Status"];
  ensureBackupDir();
  const lines = [headers.join(",")];

  for (const item of analytics) {
    const total = item.success + item.fail;
    const rate = total > 0 ? ((item.success / total) * 100).toFixed(1) + "%" : "0%";
    const status = (item.success >= 5 && (item.success / Math.max(1, total)) >= 0.9) ? "Safe" : "Restricted";
    lines.push(`"${item.key}","${item.success}","${item.fail}","${rate}","${status}"`);
  }
  fs.writeFileSync(csvPath, `${lines.join("\n")}\n`, "utf8");
}

module.exports = {
  getLocalDateTime,
  syncAnalyticsToSheet,
  syncProjectToSheet,
  syncScenesToSheet,
};
