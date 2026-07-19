#!/bin/bash

# Di chuyển đến thư mục dự án Nextcloud cố định
PROJECT_DIR="/Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short"
cd "$PROJECT_DIR"

# Đọc API Key từ môi trường hoặc yêu cầu nhập nếu chưa có
if [ -z "$GEMINI_API_KEY" ]; then
    # Thử đọc từ cấu hình shell cá nhân
    if [ -f ~/.bash_profile ]; then source ~/.bash_profile; fi
    if [ -f ~/.zshrc ]; then source ~/.zshrc; fi
fi

echo "=================================================="
echo "       AI VIDEO FACTORY - TIMELINE GENERATOR"
echo "=================================================="
echo ""

# Nếu vẫn chưa có API Key, yêu cầu người dùng nhập và lưu tạm trong phiên làm việc này
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

# Xử lý dọn dẹp đường dẫn (cắt bỏ dấu nháy, dấu sổ chéo thừa do thao tác kéo thả trên macOS)
VIDEO_PATH=$(echo "$VIDEO_PATH" | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//' -e 's/\\ / /g' -e 's/\\//g')

if [ -z "$VIDEO_PATH" ] || [ ! -f "$VIDEO_PATH" ]; then
    echo ""
    echo "❌ Lỗi: File video không tồn tại tại đường dẫn: $VIDEO_PATH"
    echo ""
    read -n 1 -s -r -p "Nhấn phím bất kỳ để thoát..."
    exit 1
fi

echo ""
echo "🚀 Đang khởi chạy Gemini AI phân tích video..."
echo "--------------------------------------------------"
node renderer/scripts/generateTimeline.js "$VIDEO_PATH"
echo "--------------------------------------------------"

echo ""
echo "=================================================="
echo "                  HOÀN TẤT"
echo "=================================================="
echo ""

read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng..."
