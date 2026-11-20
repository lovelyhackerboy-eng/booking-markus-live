// Copies ui/ (the vanilla-JS interface) to public/app/, which Next serves at /v2/app/. Run before dev and build.
import { cpSync, rmSync } from "node:fs";

rmSync("public/app", { recursive: true, force: true });
cpSync("ui", "public/app", { recursive: true });
console.log("ui → public/app");
