import "server-only";
import { Pool } from "pg";

const globalForPg = globalThis as unknown as { __ttt_pg_pool?: Pool };

export function getPool(): Pool {
  if (!globalForPg.__ttt_pg_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL не задан");
    }
    globalForPg.__ttt_pg_pool = new Pool({
      connectionString,
      // Большинство хостингов (Supabase, Neon, Railway) требуют SSL,
      // но выдают сертификат, который Node не всегда может проверить
      // в serverless-окружении — поэтому отключаем строгую проверку.
      ssl: connectionString.includes("sslmode=disable")
        ? false
        : { rejectUnauthorized: false },
      // Держим пул маленьким и быстро отпускаем простаивающие соединения —
      // на serverless (Vercel) одновременно может ожить много инстансов
      // функции, и общий лимит соединений у бесплатного Supabase невелик.
      // ВАЖНО: для serverless обязательно используйте Transaction Pooler
      // (порт 6543) в строке подключения, а не Session Pooler (порт 5432) —
      // последний держит соединения открытыми и быстро упирается в лимит.
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalForPg.__ttt_pg_pool;
}
