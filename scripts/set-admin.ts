import "dotenv/config";
import { existsSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

for (const file of [".env", ".env.local"]) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) config({ path, override: true });
}

async function main() {
  const [, , emailArg, nameArg, passwordArg] = process.argv;
  if (!emailArg || !nameArg || !passwordArg) {
    console.error(
      'Использование: npx tsx scripts/set-admin.ts "email@example.com" "Имя" "пароль"',
    );
    process.exit(1);
  }
  if (passwordArg.length < 8) {
    console.error("Пароль должен быть не короче 8 символов.");
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL не задан в .env.local — нечего обновлять.");
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=disable")
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    await pool.query(
      `INSERT INTO allowed_emails (email, added_by) VALUES ($1, 'bootstrap-script')
       ON CONFLICT (email) DO NOTHING`,
      [email],
    );

    const passwordHash = await bcrypt.hash(passwordArg, 10);
    const colors = ["#2451B3", "#2E9E6C", "#C9852A", "#7C5CBF", "#C34D4D", "#1F8C99"];
    let hash = 0;
    for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
    const color = colors[hash % colors.length];

    await pool.query(
      `INSERT INTO users (email, name, color, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, 'admin', true)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         role = 'admin',
         is_active = true`,
      [email, nameArg, color, passwordHash],
    );

    console.log(`[set-admin] Готово: ${email} — администратор, пароль обновлён.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[set-admin] Ошибка:", err);
  process.exit(1);
});
