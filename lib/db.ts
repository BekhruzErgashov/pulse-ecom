/**
 * Если задан DATABASE_URL — используется настоящая Postgres-БД
 * (lib/store-db.ts). Иначе данные живут в памяти процесса
 * (lib/store-memory.ts) и пропадают при перезапуске сервера.
 * См. lib/data.ts — единая точка входа для обеих реализаций.
 */
export function isDatabaseAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

