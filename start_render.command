#!/bin/bash

# Di chuyển đến thư mục dự án Nextcloud cố định
PROJECT_DIR="/Users/khan/Library/CloudStorage/Nextcloud-ltckha@nc․giayhainancy․vn/Share_Folder/Long2Short"
cd "$PROJECT_DIR"

echo "========================="
echo " AI VIDEO FACTORY"
echo "========================="
echo ""

node renderer/scripts/render.js

echo ""
echo "========================="
echo " DONE"
echo "========================="
echo ""

read -n 1 -s -r -p "Press any key to close..."