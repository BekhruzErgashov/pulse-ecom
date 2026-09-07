import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";
import { Pool } from "pg";
import { SCHEMA_SQL } from "../lib/schema.sql";

// dotenv по умолчанию грузит только .env — а Next.js использует .env.local.
// Подхватываем оба, приоритет у .env.local (как и в самом Next.js).
for (const file of [".env", ".env.local"]) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) config({ path, override: true });
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(
      "[migrate] DATABASE_URL не задан — используется in-memory хранилище, миграция не нужна.",
    );
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=disable")
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    console.log("[migrate] Подключение к базе...");
    await pool.query(SCHEMA_SQL);
    console.log("[migrate] Таблицы users, boards, board_members, tasks готовы.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] Ошибка миграции:", err);
  process.exit(1);
});
