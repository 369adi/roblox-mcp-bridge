// Builds plugin/BrickwireChat.rbxmx (a Script model) from the Lua source — for manual install:
// drag it into Studio, right-click → "Save as Local Plugin…".
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const src = fs.readFileSync(path.join(ROOT, "plugin", "BrickwireChat.plugin.lua"), "utf8");
const cdata = src.split("]]>").join("]]]]><![CDATA[>");
const xml = `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
\t<Item class="Script" referent="RBX0">
\t\t<Properties>
\t\t\t<string name="Name">BrickwireChat</string>
\t\t\t<token name="RunContext">0</token>
\t\t\t<ProtectedString name="Source"><![CDATA[${cdata}]]></ProtectedString>
\t\t</Properties>
\t</Item>
</roblox>
`;
fs.writeFileSync(path.join(ROOT, "plugin", "BrickwireChat.rbxmx"), xml);
console.log("plugin/BrickwireChat.rbxmx written");
