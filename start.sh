#!/bin/bash
cd "$(dirname "$0")"

# 确保 PostgreSQL 在运行
sudo service postgresql start 2>/dev/null

echo ""
echo "  墨 Inkwell v0.2 启动中..."
echo "  ─────────────────────────"
echo "  前端: http://localhost:5173"
echo "  API:  http://localhost:3001"
echo "  按 Ctrl+C 停止"
echo ""

npm run dev
