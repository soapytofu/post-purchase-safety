import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// Mechanical copy: keep a single canonical data model, with separate migration histories.
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const directory = new URL("../prisma/hosted/", import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(new URL("schema.prisma", directory), schema.replace('provider = "sqlite"', 'provider = "postgresql"'));
