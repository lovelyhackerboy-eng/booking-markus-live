// CloudLinux/Passenger startup file. Loads secrets from the private state dir
// (never from the selector's env config, which prints them), then starts the Next.js standalone server.
const fs = require("node:fs");
const envFile = process.env.MKV2_ENV_FILE || "/home/thestvco/markus-v2-state/runtime.env";
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
process.env.NODE_ENV = process.env.NODE_ENV || "production";
require("./server.js");
