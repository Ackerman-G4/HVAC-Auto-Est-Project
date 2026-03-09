// Prisma configuration for Neon PostgreSQL
import "dotenv/config";
import { defineConfig } from "prisma/config";

const connectionString =
  process.env["DIRECT_URL"] || process.env["DATABASE_URL"] || process.env["NETLIFY_DATABASE_URL"];

const hasPlaceholder =
  !!connectionString &&
  (connectionString.includes("YOUR_PASSWORD") || connectionString.includes("YOUR_HOST"));

// Keep Prisma CLI usable (e.g., postinstall generate) even before real env vars are configured.
const safeConnectionString =
  !connectionString || hasPlaceholder
    ? "postgresql://postgres:postgres@localhost:5432/postgres"
    : connectionString;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prefer DIRECT_URL for migrations, then fallback to app/runtime DB URLs.
    url: safeConnectionString,
  },
});
