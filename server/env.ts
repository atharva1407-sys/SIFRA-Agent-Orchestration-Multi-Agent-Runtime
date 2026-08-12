import { config } from "dotenv";

// Load .dev.vars into process.env. This module MUST be imported first in entry points (server/index.ts)
// (before anything that reads env at load time, like sifra/db.ts) because ES
// module imports are evaluated before top-level statements.
config({ path: ".dev.vars" });
