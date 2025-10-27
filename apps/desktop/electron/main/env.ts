import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from the monorepo root directory
const monorepoRoot = path.join(__dirname, "../../../..");
config({ path: path.join(monorepoRoot, ".env") });
