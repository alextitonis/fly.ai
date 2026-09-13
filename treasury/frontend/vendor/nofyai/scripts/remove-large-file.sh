#!/bin/bash

# 从 Git 历史中彻底删除大文件的脚本
# 使用方法: ./scripts/remove-large-file.sh images/video.mov

set -e

# 检查参数
if [ -z "$1" ]; then
  echo "错误: 请指定要删除的文件路径"
  echo "使用方法: $0 <文件路径>"
  echo "示例: $0 images/video.mov"
  exit 1
fi

FILE_PATH="$1"

echo "📋 准备从 Git 历史中删除文件: $FILE_PATH"
echo ""

# 确认操作
read -p "⚠️  警告: 这将重写 Git 历史记录！是否继续? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 操作已取消"
  exit 0
fi

echo ""
echo "🔨 步骤 1/4: 从 Git 历史中删除文件..."
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch $FILE_PATH" \
  --prune-empty --tag-name-filter cat -- --all

echo ""
echo "🧹 步骤 2/4: 清理引用..."
rm -rf .git/refs/original/

echo ""
echo "♻️  步骤 3/4: 运行垃圾回收..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo ""
echo "✅ 文件已从历史中删除！"
echo ""
echo "📤 步骤 4/4: 推送到远程仓库"
echo "运行以下命令强制推送（覆盖远程历史）："
echo ""
echo "  git push origin --force --all"
echo "  git push origin --force --tags  # 如果有 tags"
echo ""
echo "⚠️  注意: 如果其他人已经克隆了此仓库，他们需要重新克隆！"
