#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
data_dir="$project_root/.local/mysql-data"
mysql_bin=${MYSQLD_BIN:-/usr/local/mysql/bin/mysqld}

if [ ! -x "$mysql_bin" ]; then
  echo "MySQL local não encontrado em $mysql_bin. Use Docker Compose ou defina MYSQLD_BIN." >&2
  exit 1
fi
if [ ! -d "$data_dir/mysql" ]; then
  echo "Dados locais não encontrados em $data_dir. Use Docker Compose ou inicialize o MySQL." >&2
  exit 1
fi

exec "$mysql_bin" --no-defaults --datadir="$data_dir" --port=3307 --bind-address=127.0.0.1 --mysqlx=0 --socket="$data_dir/mysql.sock" --pid-file="$data_dir/mysql.pid"
