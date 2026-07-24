#!/bin/bash
cd "$(dirname "$0")"

if [ -z "$GEMINI_API_KEY" ]; then
    if [ -f ~/.bash_profile ]; then source ~/.bash_profile; fi
    if [ -f ~/.zshrc ]; then source ~/.zshrc; fi
fi

echo "=================================================="
echo "      AUTO-VIDEO-FACTORY - VIRAL STYLE LEARNER"
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

echo "👉 Kéo thả file video viral mẫu (.mp4) bạn muốn học vào cửa sổ này,"
echo "   sau đó nhấn [ENTER] để bắt đầu phân tích:"
echo ""

read -p "Đường dẫn video viral mẫu: " VIDEO_PATH

VIDEO_PATH=$(echo "$VIDEO_PATH" | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//' -e 's/\\ / /g' -e 's/\\//g')

if [ -z "$VIDEO_PATH" ] || [ ! -f "$VIDEO_PATH" ]; then
    echo ""
    echo "❌ Lỗi: File video không tồn tại tại đường dẫn: $VIDEO_PATH"
    echo ""
    read -n 1 -s -r -p "Nhấn phím bất kỳ để thoát..."
    exit 1
fi

echo ""
echo "🚀 Đang khởi chạy Gemini AI phân tích & học phong cách video mẫu..."
echo "--------------------------------------------------"

node renderer/scripts/learnStyle.js "$VIDEO_PATH"

echo ""
echo "=================================================="
echo "                  HOÀN TẤT"
echo "=================================================="
echo ""
read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng..."
