#!/bin/bash
cd "$(dirname "$0")"

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
