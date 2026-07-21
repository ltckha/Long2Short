#!/bin/bash
cd "$(dirname "$0")"

echo "================================="
echo "   AUTO-VIDEO-FACTORY — GITHUB"
echo "================================="
echo ""

if git diff --quiet && git diff --cached --quiet; then
  echo "✅ Không có thay đổi nào cần đồng bộ."
  echo ""
  read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng..."
  exit 0
fi

echo "📂 Các file thay đổi:"
git status --short
echo ""

read -p "💬 Nhập mô tả thay đổi (Enter để dùng timestamp): " COMMIT_MSG

if [ -z "$COMMIT_MSG" ]; then
  COMMIT_MSG="Update $(date '+%Y-%m-%d %H:%M')"
fi

echo ""
echo "📦 Đang stage và commit..."
git add .
git commit -m "$COMMIT_MSG"

echo ""
echo "🚀 Đang push lên GitHub..."
git push

if [ $? -eq 0 ]; then
  echo ""
  echo "================================="
  echo "   ✅ ĐỒNG BỘ THÀNH CÔNG!"
  echo "================================="
  echo "   $COMMIT_MSG"
  echo "================================="
else
  echo ""
  echo "================================="
  echo "   ❌ PUSH THẤT BẠI"
  echo "   Kiểm tra kết nối và token."
  echo "================================="
fi

echo ""
read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng..."
