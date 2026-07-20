const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { resolveSubtitleStyle } = require("./subtitleStyles");
const { getSubtitlePosition } = require("./textPositionEngine");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "assets", "subtitle_swatches");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const STYLES_TO_PREVIEW = [
  { key: "hook_bold", text: "BÍ QUYẾT LÀM SẠCH GIÀY ĐẾN 99%" },
  { key: "framed_card", text: "LAU SẠCH BỌT BẨN BAN ĐẦU" },
  { key: "cta_red", text: "ĐẾ GIÀY SẠCH BÓNG NHƯ MỚI" },
  { key: "neon_glow", text: "HIỆU ỨNG DẠ QUANG RỰC RỠ" },
  { key: "gold_caption", text: "PHONG CÁCH HOÀNG GIA SANG TRỌNG" },
];

function generateSwatches() {
  console.log("🎨 Đang sinh bộ ảnh mẫu Preview cho các Subtitle Style...");

  for (const item of STYLES_TO_PREVIEW) {
    const style = resolveSubtitleStyle(item.key);
    const safeArea = { topRatio: 0.15, centerRatio: 0.46, bottomRatio: 0.13 };
    const pos = getSubtitlePosition("top", safeArea);

    const txtFile = path.join(OUTPUT_DIR, `temp_${item.key}.txt`);
    fs.writeFileSync(txtFile, item.text, "utf8");

    const fontFile = "/System/Library/Fonts/HelveticaNeue.ttc";

    let filterStr = "";
    if (style.layers && style.layers.length > 0) {
      filterStr = style.layers
        .map((layer) => {
          const fontcolor = layer.fontcolor || style.fontcolor || "white";
          const borderw = layer.borderw || style.borderw || "0";
          const bordercolor = layer.bordercolor || style.bordercolor || "black";
          const shadowx = layer.shadowx || style.shadowx || "0";
          const shadowy = layer.shadowy || style.shadowy || "0";
          const shadowcolor = layer.shadowcolor || style.shadowcolor || "black";
          const box = layer.box || (style.box ? "1" : "0");
          const boxcolor = layer.boxcolor || style.boxcolor || "black@0.0";
          const boxborderw = layer.boxborderw || style.boxborderw || "0";

          const xOffsetNum = (Number(layer.xOffset) || 0);
          const yOffsetNum = (Number(layer.yOffset) || 0);
          const xExpr = xOffsetNum !== 0 ? `((w-text_w)/2)+${xOffsetNum}` : `(w-text_w)/2`;
          const yExpr = yOffsetNum !== 0 ? `(${pos.y})+${yOffsetNum}` : pos.y;

          return `drawtext=textfile='${txtFile}':fontfile='${fontFile}':fontcolor=${fontcolor}:fontsize=${style.fontsize}:line_spacing=16:borderw=${borderw}:bordercolor=${bordercolor}:shadowx=${shadowx}:shadowy=${shadowy}:shadowcolor=${shadowcolor}:box=${box}:boxcolor=${boxcolor}:boxborderw=${boxborderw}:text_align=C:x='${xExpr}':y='${yExpr}'`;
        })
        .join(",");
    } else {
      filterStr = `drawtext=textfile='${txtFile}':fontfile='${fontFile}':fontcolor=${style.fontcolor}:fontsize=${style.fontsize}:line_spacing=16:borderw=${style.borderw}:bordercolor=${style.bordercolor}:shadowx=${style.shadowx}:shadowy=${style.shadowy}:shadowcolor=${style.shadowcolor}:box=${style.box ? 1 : 0}:boxcolor=${style.boxcolor}:boxborderw=${style.boxborderw}:text_align=C:x=(w-text_w)/2:y='${pos.y}'`;
    }

    const outPng = path.join(OUTPUT_DIR, `${item.key}.png`);
    const cmd = `ffmpeg -y -f lavfi -i color=c=0x0F172A:s=1080x1920:d=1 -vf "${filterStr}" -vframes 1 "${outPng}"`;

    try {
      execSync(cmd, { stdio: "ignore" });
      console.log(` ✅ Đã tạo ảnh swatch: ${item.key}.png`);
    } catch (err) {
      console.error(` ❌ Lỗi tạo swatch ${item.key}: ${err.message}`);
    } finally {
      if (fs.existsSync(txtFile)) fs.unlinkSync(txtFile);
    }
  }
}

generateSwatches();
