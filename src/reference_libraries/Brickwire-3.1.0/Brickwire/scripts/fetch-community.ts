#!/usr/bin/env node
/** Builds extension/public/library/community.json (ui-resources.com catalogue + curated links).
 *  Usage: node --import tsx scripts/fetch-community.ts [cached-api.json] */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMMUNITY_API, communityData } from "../shared/src/library/community.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2];
const raw = src ? JSON.parse(fs.readFileSync(src, "utf8")) : await (await fetch(COMMUNITY_API, { headers: { "User-Agent": "Brickwire/1.7 (+library)" } })).json();
const data = communityData(raw);
const file = path.join(root, "extension/public/library/community.json");
fs.writeFileSync(file, JSON.stringify(data));
console.log(`community: ${data.count} items → ${path.relative(root, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
