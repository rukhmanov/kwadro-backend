#!/bin/bash

# Скрипт для создания бэкапа базы данных PostgreSQL

# Загружаем переменные окружения из .env файла, если он существует
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Параметры подключения к БД (из переменных окружения или значения по умолчанию)
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-aleksrukhmanov}
DB_NAME=${DB_NAME:-kwadro_shop}

# Создаем директорию для бэкапов, если её нет
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# Генерируем имя файла с датой и временем
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/kwadro_shop_backup_$TIMESTAMP.sql"

# Определяем путь к pg_dump (предпочитаем версию 18, если доступна)
if [ -f "/opt/homebrew/opt/postgresql@18/bin/pg_dump" ]; then
    PG_DUMP="/opt/homebrew/opt/postgresql@18/bin/pg_dump"
elif [ -f "/usr/local/opt/postgresql@18/bin/pg_dump" ]; then
    PG_DUMP="/usr/local/opt/postgresql@18/bin/pg_dump"
else
    PG_DUMP="pg_dump"
fi

# Формируем команду pg_dump
# Используем формат SQL (plain text) для лучшей совместимости между версиями
PGPASSWORD=${DB_PASSWORD:-""} "$PG_DUMP" -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F p -f "$BACKUP_FILE" 2>&1

# Проверяем успешность выполнения
if [ $? -eq 0 ]; then
    echo "✅ Бэкап успешно создан: $BACKUP_FILE"
    
    # Создаем также сжатый вариант
    gzip -c "$BACKUP_FILE" > "$BACKUP_FILE.gz"
    echo "✅ Сжатый бэкап создан: $BACKUP_FILE.gz"
    
    # Удаляем несжатый файл
    rm "$BACKUP_FILE"
    echo "📦 Финальный файл: $BACKUP_FILE.gz"
    
    # Показываем размер файла
    ls -lh "$BACKUP_FILE.gz"
else
    echo "❌ Ошибка при создании бэкапа!"
    exit 1
fi












