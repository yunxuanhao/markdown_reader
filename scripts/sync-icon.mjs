import sharp from "sharp";
import { execSync } from "child_process";

const src = "icon.png";
const destDir = "src-tauri/icons";

async function main() {
  // Load user's icon, trim transparent edges
  const trimmed = await sharp(src).trim().toBuffer();
  const meta = await sharp(trimmed).metadata();
  console.log(`Trimmed: ${meta.width}x${meta.height}`);

  // Square crop from center
  const size = Math.min(meta.width, meta.height);
  const squared = await sharp(trimmed)
    .extract({
      left: Math.floor((meta.width - size) / 2),
      top: Math.floor((meta.height - size) / 2),
      width: size,
      height: size,
    })
    .resize(1024, 1024)
    .png()
    .toBuffer();
  console.log(`Squared: ${size}x${size} → 1024x1024`);

  // Save to icons dir
  await sharp(squared).toFile(`${destDir}/icon.png`);
  console.log(`Saved: ${destDir}/icon.png`);

  // Also update root
  await sharp(squared).toFile("icon.png");
  console.log("Updated root icon.png");

  // Regenerate all platform icons
  console.log("Regenerating platform icons...");
  execSync("pnpm tauri icon src-tauri/icons/icon.png", { stdio: "inherit" });

  console.log("Done. Ready to build.");
}

main().catch(console.error);
