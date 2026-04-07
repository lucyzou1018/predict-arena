import "dotenv/config";
import { initDB } from "./database.js";
async function run() { console.log("Running migration..."); await initDB(); console.log("Done."); process.exit(0); }
run().catch((e) => { console.error(e); process.exit(1); });
