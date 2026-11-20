import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { SchemaEngine } from "@prisma/schema-engine-wasm";

const require = createRequire(import.meta.url);
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const { bindMigrationAwareSqlAdapterFactory } = require("@prisma/driver-adapter-utils");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL gerekli.");

const root = new URL("../prisma/migrations/", import.meta.url);
const migrationNames = (await readdir(root, { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();
if (!migrationNames.length) throw new Error("Uygulanacak Prisma migration dosyası bulunamadı.");

const migrationDirectories = await Promise.all(migrationNames.map(async path => ({
  path,
  migrationFile: {
    path: "migration.sql",
    content: { tag: "ok", value: await readFile(new URL(`${path}/migration.sql`, root), "utf8") },
  },
})));
const lockfile = {
  path: "migration_lock.toml",
  content: await readFile(new URL("migration_lock.toml", root), "utf8"),
};
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5_000 });
const adapter = bindMigrationAwareSqlAdapterFactory(new PrismaPg(pool));
let engine;
try {
  engine = await SchemaEngine.new({ datamodels: undefined }, () => {}, adapter);
  const result = await engine.applyMigrations({
    migrationsList: { baseDir: fileURLToPath(root), lockfile, migrationDirectories, shadowDbInitScript: "" },
    filters: { externalTables: [], externalEnums: [] },
  });
  console.log(result.appliedMigrationNames.join(", ") || "Veritabanı şeması güncel.");
} finally {
  engine?.free();
  await pool.end();
}
