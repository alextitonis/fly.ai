#!/bin/bash
# ========================================
# NofyAI 数据备份脚本
# ========================================
# 用途：备份配置文件和决策日志
# 使用：./scripts/backup.sh
# Cron: 0 2 * * * /path/to/scripts/backup.sh

# 配置
PROJECT_DIR="/opt/nofyai"  # 修改为实际项目路径
BACKUP_DIR="/backup/nofyai"  # 修改为实际备份路径
KEEP_DAYS=7  # 保留最近N天的备份

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$BACKUP_DIR/backup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

# 创建备份目录
mkdir -p $BACKUP_DIR

log "${YELLOW}📦 开始备份...${NC}"

# 1. 备份配置文件
log "备份配置文件..."
if [ -f "$PROJECT_DIR/config.json" ]; then
    cp $PROJECT_DIR/config.json $BACKUP_DIR/config_$DATE.json
    log "${GREEN}✅ config.json 已备份${NC}"
else
    log "⚠️  config.json 不存在"
fi

# 2. 备份决策日志
log "备份决策日志..."
if [ -d "$PROJECT_DIR/decision_logs" ]; then
    tar -czf $BACKUP_DIR/decision_logs_$DATE.tar.gz -C $PROJECT_DIR decision_logs/
    log "${GREEN}✅ decision_logs 已备份 ($(du -h $BACKUP_DIR/decision_logs_$DATE.tar.gz | cut -f1))${NC}"
else
    log "⚠️  decision_logs 目录不存在"
fi

# 3. 备份数据目录（如果有）
if [ -d "$PROJECT_DIR/data" ]; then
    log "备份数据目录..."
    tar -czf $BACKUP_DIR/data_$DATE.tar.gz -C $PROJECT_DIR data/
    log "${GREEN}✅ data 已备份${NC}"
fi

# 4. 清理旧备份
log "清理 ${KEEP_DAYS} 天前的旧备份..."
find $BACKUP_DIR -name "*.tar.gz" -mtime +$KEEP_DAYS -delete
find $BACKUP_DIR -name "config_*.json" -mtime +$KEEP_DAYS -delete

# 5. 显示备份统计
log "${GREEN}✅ 备份完成！${NC}"
log "备份目录: $BACKUP_DIR"
log "当前备份文件数: $(ls -1 $BACKUP_DIR/*.tar.gz 2>/dev/null | wc -l)"
log "总备份大小: $(du -sh $BACKUP_DIR | cut -f1)"
