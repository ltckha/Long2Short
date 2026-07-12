# BẢN ĐỒ NGỮ CẢNH HỆ THỐNG (SYSTEM STATUS & CONTEXT MAP)

Tài liệu này đóng vai trò là **Bộ nhớ Trạng thái Cục bộ (Local State Memory)** để các AI Assistant (như Gemini, Claude) đọc nhanh mỗi khi khởi động phiên làm việc mới, giúp nắm bắt ngay tình trạng hệ thống mà không cần quét lại toàn bộ mã nguồn.

---

## 1. Tổng quan Dự án
- **Tên dự án:** Long2Short (hoặc AI-Video-Factory).
- **Mục tiêu:** Tự động cắt ghép, dựng video ngắn (Short-form, TikTok, Reels) từ video dài hoặc kịch bản thông qua timeline JSON và ffmpeg.
- **Công nghệ chính:** NodeJS (ES6/CommonJS), FFmpeg, FFprobe.
- **Môi trường chạy:** macOS (Apple Silicon), lưu trữ trực tiếp trên thư mục mount Nextcloud (`/Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short`).

---

## 2. Các Mốc Chỉnh sửa & Cấu hình Quan trọng (Status: Đang Hoạt Động Tốt)

### 📌 Cấp quyền & Đường dẫn động (`start_render.command`)
- **Vị trí:** [start_render.command](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/start_render.command)
- **Tính năng:** Tự động nhận diện thư mục chạy thực tế (`SCRIPT_DIR`) để di chuyển đến đúng vị trí, cho phép dự án hoạt động portable ở bất kỳ đâu.
- **Quyền hạn:** Đã cấp quyền `chmod 755` và xóa hoàn toàn cờ quarantine của macOS.

### 📌 Chuẩn hóa Âm thanh (Audio Normalization)
- **Vị trí:** [render.js](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/scripts/render.js) (hàm `renderScene` và `renderTemporalWarpScene`).
- **Logic hoạt động:**
  - Sử dụng `ffprobe` (`hasAudioStream`) để kiểm tra nếu video gốc không có tiếng, hệ thống tự động chèn luồng âm thanh tĩnh bằng bộ lọc `anullsrc`.
  - Các phân cảnh tua nhanh/chậm (`renderTemporalWarpScene`) tự động chèn thêm silent audio đúng thời lượng thay vì sử dụng `-an` (tắt tiếng).
  - Mục tiêu: Đảm bảo 100% các scene con đầu ra đều chứa track audio chuẩn hóa (AAC, Stereo, 44100Hz, 160k) để ghép nối (`concat`) không bị lỗi.

### 📌 Ghép Voice WAV per-Scene (Voice Audio Injection)
- **Vị trí:** [render.js](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/scripts/render.js) (hàm `resolveVoiceWav` + `renderScene`).
- **Cách hoạt động:** n8n sinh file `.wav` voice cho từng scene và đặt vào thư mục `incoming/` theo quy ước đặt tên `{projectId}_{scene_id}.wav` (ví dụ: `20260708_183534_scene_001.wav`). Trước khi render mỗi scene, hệ thống tự động tìm file WAV tương ứng:
  - **Có WAV** → ghép WAV làm audio track duy nhất (video channel từ mp4, audio channel từ wav), dùng `-shortest` để đồng bộ thời lượng.
  - **Không có WAV + video có audio** → giữ nguyên audio gốc của video.
  - **Không có WAV + video không có audio** → chèn silent audio (`anullsrc`).
- **⚠️ Lưu ý:** Không tự ý sửa logic 3 nhánh này để tránh lỗi mismatch audio khi concat.

### 📌 Tự động Dọn dẹp Tài nguyên (Temp Cleanup)
- **Vị trí:** [render.js](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/scripts/render.js) (hàm `cleanupTempDir`).
- **Logic hoạt động:** Xóa toàn bộ file tạm (`.mp4`, `.txt`, `.txt` phụ đề) ngay sau khi render thành công hoặc thất bại. Chỉ giữ lại thư mục `temp/fontconfig` để tối ưu hóa cache font chữ cho các lần render tiếp theo.

---

## 3. Bản đồ Script NodeJS (`renderer/scripts/`)

| File | Kích thước | Vai trò | Hàm / Logic quan trọng |
| :--- | :---: | :--- | :--- |
| [render.js](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/scripts/render.js) | ~44KB | **Cốt lõi.** Điều phối toàn bộ quy trình render: đọc timeline JSON, dựng lệnh ffmpeg, ghép cảnh (`concat`), quản lý hàng đợi `incoming/` | `renderScene`, `renderTemporalWarpScene`, `hasAudioStream` (chèn `anullsrc`), `cleanupTempDir`, `archiveSuccessfulRender`, `handleProjectFailure` |
| [effects.js](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/scripts/effects.js) | ~28KB | Registry toàn bộ hiệu ứng hình ảnh: zoom, shake, speed ramp, cinematic... Chứa hàm xây dựng tham số filter ffmpeg cho từng effect | `normalizeAdvancedEffect`, `buildEffectArgs`, `ADVANCED_EFFECT_ENUMS` (bộ enum hợp lệ: intent, mood, pacing, focus, camera_motion) |
| [effectLearning.js](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/scripts/effectLearning.js) | ~10KB | **Học máy hiệu ứng.** Ánh xạ tên hiệu ứng tùy ý từ AI sang tên hiệu ứng hợp lệ trong registry. Lưu vào `effects/learned_effects.json` | `resolveLearnedAdvancedEffect`, `initializeEffectLearning`, `learnFrequentFallbacksFromLogs`, `matchHeuristic`, `matchSimilarity` |
| [subtitleStyles.js](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/scripts/subtitleStyles.js) | ~10KB | Registry toàn bộ kiểu phụ đề: font, màu sắc, border, shadow, vị trí. Tương ứng với các `subtitle_style` trong prompt | `resolveSubtitleStyle`, `normalizeStyleKey` — ánh xạ `hook_bold`, `neon_glow`, `framed_card`, `gold_caption`, `cta_red` |
| [subtitleLayoutEngine.js](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/scripts/subtitleLayoutEngine.js) | ~3.6KB | Tính toán bố cục an toàn (safe zone) để phụ đề không che sản phẩm, tự wrap chữ nếu quá dài | `prepareSubtitleLayout` — tính `safeX`, `safeBottom`, `baseFontSize` theo độ phân giải thực tế |
| [textPositionEngine.js](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/scripts/textPositionEngine.js) | ~0.7KB | Chuẩn hóa giá trị `text_position` đầu vào (`top`, `center`, `bottom`). Fallback về `bottom` nếu giá trị không hợp lệ | `normalizePosition` |
| [fontRegistry.js](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/scripts/fontRegistry.js) | ~3.4KB | Quét và đăng ký font chữ từ hệ thống macOS + thư mục `assets/fonts/`. Tạo `FONTCONFIG_PATH` trỏ vào `temp/fontconfig` | `initFontRegistry`, `resolveFont` — dùng để ffmpeg tìm font khi vẽ chữ lên video |
| [captionGenerator.js](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/scripts/captionGenerator.js) | ~0.7KB | Sinh nội dung caption/post text từ `video_meta` của timeline JSON để dùng cho mạng xã hội | `buildPostText` — đọc `title`, `description`, `hashtags` từ `video_meta` |
| [archiveWorkflow.js](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/scripts/archiveWorkflow.js) | ~2.3KB | Quản lý vòng đời project sau khi render xong: di chuyển video thành phẩm sang `rendered/` hoặc `failed/`, tạo folder archive có timestamp | `createWorkflowContext`, `archiveSuccessfulRender`, `handleProjectFailure` |

> [!NOTE]
> **Luồng thực thi cơ bản:** `render.js` → đọc `incoming/*.json` → gọi `effects.js` + `effectLearning.js` để dịch hiệu ứng → gọi `subtitleStyles.js` + `subtitleLayoutEngine.js` + `fontRegistry.js` để dựng subtitle → thực thi `ffmpeg` → dọn dẹp tạm bằng `cleanupTempDir` → lưu kết quả bằng `archiveWorkflow.js`.

---

## 4. Hệ thống Prompt AI & n8n Integration

Toàn bộ các Prompt System phục vụ cho việc tích hợp n8n được lưu trữ tập trung tại thư mục `renderer/prompts/`:

| File Prompt | Nhiệm vụ | Bản Backup |
| :--- | :--- | :--- |
| [timeline_generator_prompt.md](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/prompts/timeline_generator_prompt.md) | Nhận diện/Cắt cảnh, gán hiệu ứng chữ & chuyển cảnh tạo JSON Timeline | [timeline_generator_prompt.v1.md](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/prompts/backups/timeline_generator_prompt.v1.md) |
| [video_style_learning_prompt.md](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/prompts/video_style_learning_prompt.md) | Phân tích phong cách dựng từ video mẫu | [video_style_learning_prompt.v1.md](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/prompts/backups/video_style_learning_prompt.v1.md) |
| [render_analyzer_prompt.md](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/prompts/render_analyzer_prompt.md) | QA/Rà soát và tối ưu hóa JSON Timeline trước khi render | [render_analyzer_prompt.v1.md](file:///Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short/renderer/prompts/backups/render_analyzer_prompt.v1.md) |

---

## 5. Hướng dẫn dành cho AI Agent tiếp theo
Khi bắt đầu một phiên làm việc mới hỗ trợ người dùng:
1. **ĐỌC ĐẦU TIÊN:** Hãy đọc trực tiếp file `SYSTEM_STATUS.md` này để hiểu nhanh các cấu hình tùy biến.
2. **KHÔNG tự ý sửa cấu trúc âm thanh:** Tránh thay đổi hoặc xóa logic `anullsrc` và `hasAudioStream` trong `render.js` để tránh tái diễn lỗi lệch âm thanh khi concat.
3. **Quản lý Prompt:** Khi người dùng yêu cầu chỉnh sửa prompt, hãy sửa đổi file chính trong thư mục `prompts/`, tuyệt đối không tự ý ghi đè các file trong `prompts/backups/` trừ khi có yêu cầu cụ thể.
