import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClientTsGenerator } = require("@prisma/client-generator-ts");
const { getGenerators } = require("@prisma/internals");

// The TypeScript generator uses the Prisma schema WASM and emits a JS-driver client.
const generators = await getGenerators({
  schemaPath: fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)),
  registry: { "prisma-client": { type: "in-process", generator: new PrismaClientTsGenerator() } },
});
try {
  for (const generator of generators) await generator.generate();
  console.log("Prisma Client generated.");
} finally {
  for (const generator of generators) generator.stop();
}
