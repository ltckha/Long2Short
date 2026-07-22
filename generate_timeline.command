#!/bin/bash
cd "$(dirname "$0")"

if [ -z "$GEMINI_API_KEY" ]; then
    if [ -f ~/.bash_profile ]; then source ~/.bash_profile; fi
    if [ -f ~/.zshrc ]; then source ~/.zshrc; fi
fi

echo "=================================================="
echo "       AUTO-VIDEO-FACTORY - TIMELINE GENERATOR"
echo "=================================================="
echo ""

if [ -z "$GEMINI_API_KEY" ]; then
    echo "⚠️  Không tìm thấy biến môi trường GEMINI_API_KEY."
    read -p "Vui lòng dán GEMINI_API_KEY của bạn vào đây và nhấn Enter: " INPUT_KEY
    echo ""
    if [ -z "$INPUT_KEY" ]; then
        echo "Lỗi: API Key không được để trống!"
        echo ""
        read -n 1 -s -r -p "Nhấn phím bất kỳ để thoát..."
        exit 1
    fi
    export GEMINI_API_KEY="$INPUT_KEY"
fi

echo "👉 Kéo thả file video (.mp4) bạn muốn phân tích vào cửa sổ này,"
echo "   sau đó nhấn [ENTER] để bắt đầu:"
echo ""

read -p "Đường dẫn video: " VIDEO_PATH

VIDEO_PATH=$(echo "$VIDEO_PATH" | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//' -e 's/\\ / /g' -e 's/\\//g')

if [ -z "$VIDEO_PATH" ] || [ ! -f "$VIDEO_PATH" ]; then
    echo ""
    echo "❌ Lỗi: File video không tồn tại tại đường dẫn: $VIDEO_PATH"
    echo ""
    read -n 1 -s -r -p "Nhấn phím bất kỳ để thoát..."
    exit 1
fi

echo ""
echo "🔍 Đang đo độ dài video nguồn..."
RAW_DUR=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO_PATH" 2>/dev/null)

MODE_FLAG="--mode=short2short"

if [ -n "$RAW_DUR" ]; then
    DUR_FLOAT=$(printf "%.1f" "$RAW_DUR")
    DUR_INT=${DUR_FLOAT%.*}

    if [ "$DUR_INT" -lt 55 ]; then
        MODE_FLAG="--mode=short2short"
        echo "⏱️ Độ dài video: ${DUR_FLOAT}s (< 55s) ➔ Tự động chọn Chế độ [Short2Short]"
    elif [ "$DUR_INT" -gt 90 ]; then
        MODE_FLAG="--mode=long2short"
        echo "⏱️ Độ dài video: ${DUR_FLOAT}s (> 90s) ➔ Tự động chọn Chế độ [Long2Short]"
    else
        echo "⏱️ Độ dài video: ${DUR_FLOAT}s (nằm trong khoảng 55s - 90s)."
        echo "🎯 Vui lòng chọn Chế độ Xử lý Video:"
        echo "   [1] Long2Short  : Cắt lọc phân cảnh đắt giá từ Video Dài (> 90s)"
        echo "   [2] Short2Short : Tái cấu trúc, đổi voice & hiệu ứng cho Video Ngắn (15s-90s)"
        echo ""
        read -p "Nhập lựa chọn của bạn [Mặc định 2]: " MODE_CHOICE
        if [ "$MODE_CHOICE" = "1" ]; then
            MODE_FLAG="--mode=long2short"
            echo "👉 Đã chọn Chế độ: LONG2SHORT"
        else
            MODE_FLAG="--mode=short2short"
            echo "👉 Đã chọn Chế độ: SHORT2SHORT"
        fi
    fi
else
    echo "⚠️ Không thể tự động đo thời lượng video. Chọn thủ công:"
    echo "   [1] Long2Short  : Cắt lọc phân cảnh đắt giá từ Video Dài"
    echo "   [2] Short2Short : Tái cấu trúc cho Video Ngắn"
    read -p "Nhập lựa chọn của bạn [Mặc định 2]: " MODE_CHOICE
    if [ "$MODE_CHOICE" = "1" ]; then
        MODE_FLAG="--mode=long2short"
    else
        MODE_FLAG="--mode=short2short"
    fi
fi

echo ""
echo "🚀 Đang khởi chạy Gemini AI phân tích video ($MODE_FLAG)..."
echo "--------------------------------------------------"

node renderer/scripts/generateTimeline.js "$VIDEO_PATH" "$MODE_FLAG"
GEN_STATUS=$?

if [ $GEN_STATUS -eq 0 ]; then
    PROJECT_ID=$(basename "$VIDEO_PATH" | sed 's/\.[^.]*$//')
    echo ""
    echo "=================================================="
    echo "⚡ BẠN CÓ MUỐN TIẾN HÀNH RENDER DỰ ÁN NGAY KHÔNG?"
    echo "   [1] Có   - Tiến hành Render & Gửi ra NAS ngay (Mặc định)"
    echo "   [2] Không - Thoát và để render sau"
    echo "=================================================="
    echo ""
    read -p "Nhập lựa chọn của bạn [Mặc định 1]: " RENDER_CHOICE

    if [ "$RENDER_CHOICE" != "2" ]; then
        echo ""
        echo "🚀 Đang tiến hành Render dự án '$PROJECT_ID'..."
        echo "--------------------------------------------------"
        node renderer/scripts/render.js "$PROJECT_ID"
    else
        echo ""
        echo "💡 Đã lưu kịch bản. Bạn có thể mở render.command để dựng video bất cứ lúc nào."
    fi
fi

echo ""
echo "=================================================="
echo "                  HOÀN TẤT"
echo "=================================================="
echo ""
read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng..."
