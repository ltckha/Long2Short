/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT: LONG2SHORT AUTOMATIC DASHBOARD
 * ==============================================================================
 * HƯỚNG DẪN SỬ DỤNG:
 * 1. Mở file Google Sheet của bạn trên trình duyệt.
 * 2. Vào mục "Tiện ích mở rộng" (Extensions) -> Chọn "Apps Script".
 * 3. Xóa toàn bộ mã cũ và dán toàn bộ đoạn mã bên dưới vào.
 * 4. Bấm "Triển khai" (Deploy) -> Chọn "Thực thi dưới dạng ứng dụng web" (New deployment -> Web app).
 * 5. Cấu hình:
 *    - Execute as: Me (Tài khoản của bạn)
 *    - Who has access: Anyone (Bất kỳ ai)
 * 6. Bấm "Triển khai" (Deploy), cấp quyền truy cập và COPY lấy "URL Ứng dụng web" (Web App URL).
 * 7. Lưu URL này vào biến môi trường: export GOOGLE_SHEET_WEBHOOK_URL="URL_vua_copy"
 * ==============================================================================
 */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    ensureSheetsAndHeaders(ss);

    const action = data.action;

    if (action === "sync_project") {
      updateProjectTracker(ss, data.project);
    } else if (action === "sync_scenes") {
      updateScenesDetail(ss, data.projectId, data.scenes);
    } else if (action === "sync_analytics") {
      updateEffectsAnalytics(ss, data.analytics);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function ensureSheetsAndHeaders(ss) {
  // 1. Tab PROJECTS_TRACKER
  let sheetTracker = ss.getSheetByName("PROJECTS_TRACKER");
  if (!sheetTracker) {
    sheetTracker = ss.insertSheet("PROJECTS_TRACKER");
    const headers = [
      "Project ID", "Status", "Input File", "Video Title", "Caption & Hashtags",
      "Original Duration", "Short Duration", "Scene Count", "Opening Hook Score",
      "Effects Summary", "Output File", "Created At", "Rendered At"
    ];
    sheetTracker.appendRow(headers);
    formatHeaderRow(sheetTracker, "#1F4E78");
  }

  // 2. Tab SCENES_DETAIL
  let sheetScenes = ss.getSheetByName("SCENES_DETAIL");
  if (!sheetScenes) {
    sheetScenes = ss.insertSheet("SCENES_DETAIL");
    const headers = [
      "Project ID", "Scene ID", "Scene Type", "Time (Start-End)", "Target Duration",
      "Subtitle (IN HOA)", "Voice Text", "Visual Cue", "Subtitle Style",
      "Advanced Effect", "Transition Out"
    ];
    sheetScenes.appendRow(headers);
    formatHeaderRow(sheetScenes, "#2E75B6");
  }

  // 3. Tab EFFECTS_ANALYTICS
  let sheetAnalytics = ss.getSheetByName("EFFECTS_ANALYTICS");
  if (!sheetAnalytics) {
    sheetAnalytics = ss.insertSheet("EFFECTS_ANALYTICS");
    const headers = ["Effect Key", "Success Count", "Fail Count", "Success Rate (%)", "Safe Pool Status"];
    sheetAnalytics.appendRow(headers);
    formatHeaderRow(sheetAnalytics, "#548235");
  }

  // Xóa Sheet1 mặc định nếu có nhiều hơn 1 tab
  const sheet1 = ss.getSheetByName("Trang tính1") || ss.getSheetByName("Sheet1");
  if (sheet1 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(sheet1); } catch (e) {}
  }
}

function formatHeaderRow(sheet, backgroundColor) {
  const range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  range.setFontWeight("bold");
  range.setFontColor("#FFFFFF");
  range.setBackground(backgroundColor);
  sheet.setFrozenRows(1);
}

function updateProjectTracker(ss, p) {
  const sheet = ss.getSheetByName("PROJECTS_TRACKER");
  const data = sheet.getDataRange().getValues();

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === p.projectId) {
      rowIndex = i + 1; // 1-indexed trong Google Sheets
      break;
    }
  }

  const rowValues = [
    p.projectId,
    p.status || "",
    p.inputFile || "",
    p.title || "",
    p.captionHashtags || "",
    p.originalDuration || "",
    p.shortDuration || "",
    p.sceneCount || "",
    p.hookScore || "",
    p.effectsSummary || "",
    p.outputFile || "",
    p.createdAt || "",
    p.renderedAt || ""
  ];

  if (rowIndex > 0) {
    // Cập nhật dòng hiện tại
    for (let c = 0; c < rowValues.length; c++) {
      if (rowValues[c] !== "" && rowValues[c] !== undefined) {
        sheet.getRange(rowIndex, c + 1).setValue(rowValues[c]);
      }
    }
  } else {
    // Thêm dòng mới
    sheet.appendRow(rowValues);
  }
}

function updateScenesDetail(ss, projectId, scenes) {
  if (!scenes || !Array.isArray(scenes)) return;
  const sheet = ss.getSheetByName("SCENES_DETAIL");
  const data = sheet.getDataRange().getValues();

  // Xóa các dòng cũ của projectId này nếu đã tồn tại
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === projectId) {
      sheet.deleteRow(i + 1);
    }
  }

  // Thêm các dòng phân cảnh mới
  for (const s of scenes) {
    const textEffectName = typeof s.text_effect === "object" ? s.text_effect.name : s.text_effect;
    const advEffectName = typeof s.advanced_effect === "object" ? s.advanced_effect.name : s.advanced_effect;
    const transOutType = s.transition_out ? `${s.transition_out.type} (${s.transition_out.duration}s)` : "none";

    const row = [
      projectId,
      s.scene_id || "",
      s.scene_type || "",
      `${s.start_s || 0}s - ${s.end_s || 0}s`,
      `${s.duration_s || 0}s`,
      s.subtitle || "",
      s.voice || "",
      s.visual_cue || "",
      `${s.subtitle_style || "default"} (${s.text_position || "bottom"})`,
      `${advEffectName || "none"} (${s.advanced_effect?.camera_motion || "static"})`,
      transOutType
    ];
    sheet.appendRow(row);
  }
}

function updateEffectsAnalytics(ss, analytics) {
  if (!analytics || !Array.isArray(analytics)) return;
  const sheet = ss.getSheetByName("EFFECTS_ANALYTICS");
  
  // Xóa dữ liệu cũ từ dòng 2 trở đi
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }

  // Append bảng hiệu năng mới
  for (const item of analytics) {
    const total = (item.success || 0) + (item.fail || 0);
    const rate = total > 0 ? ((item.success / total) * 100).toFixed(1) + "%" : "0%";
    const status = (item.success >= 5 && (item.success / Math.max(1, total)) >= 0.9) ? "✅ Safe (Sử dụng)" : "⚠️ Restricted";

    sheet.appendRow([
      item.key,
      item.success || 0,
      item.fail || 0,
      rate,
      status
    ]);
  }
}
