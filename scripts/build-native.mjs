import { execSync } from "child_process";

const targets = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "win32-x64": "x86_64-pc-windows-msvc",
  "linux-x64": "x86_64-unknown-linux-gnu",
};

const key = `${process.platform}-${process.arch}`;
const target = targets[key];

if (!target) {
  console.error(`No target for platform: ${key}`);
  process.exit(1);
}

console.log(`Building for: ${key} → ${target}`);
execSync(`tauri build --target ${target}`, { stdio: "inherit" });
