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

echo "🎯 Chọn Chế độ Xử lý Video (Pipeline Mode):"
echo "   [1] Long2Short  : Cắt lọc phân cảnh đắt giá từ Video Dài (> 90s)"
echo "   [2] Short2Short : Tái cấu trúc, đổi voice & hiệu ứng cho Video Ngắn (15s-90s)"
echo ""
read -p "Nhập lựa chọn của bạn [Mặc định 1]: " MODE_CHOICE

MODE_FLAG="--mode=long2short"
if [ "$MODE_CHOICE" = "2" ]; then
    MODE_FLAG="--mode=short2short"
    echo "👉 Đã chọn Chế độ: SHORT2SHORT"
else
    echo "👉 Đã chọn Chế độ: LONG2SHORT"
fi

echo ""
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
echo "🚀 Đang khởi chạy Gemini AI phân tích video ($MODE_FLAG)..."
echo "--------------------------------------------------"
node renderer/scripts/generateTimeline.js "$VIDEO_PATH" "" "$MODE_FLAG"
echo "--------------------------------------------------"

echo ""
echo "=================================================="
echo "                  HOÀN TẤT"
echo "=================================================="
echo ""

read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng..."
