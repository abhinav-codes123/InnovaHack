import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import pg from "pg";

try {
  loadEnvFile(new URL("../../../.env", import.meta.url));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const schema = await readFile(
  resolve(currentDirectory, "../database/schema.sql"),
  "utf8"
);
const pool = new pg.Pool({
  connectionString,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: true }
      : undefined
});

try {
  await pool.query(schema);
  console.log("VeriFact database schema is up to date.");
} finally {
  await pool.end();
}
