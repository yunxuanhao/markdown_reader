import sharp from "sharp";

const src = "icon.png";
const destDir = "src-tauri/icons";

async function main() {
  // Load and trim transparent pixels
  const trimmed = await sharp(src).trim().toBuffer();
  const meta = await sharp(trimmed).metadata();
  console.log(`Trimmed to: ${meta.width}x${meta.height}`);

  // Make square by taking center crop
  const size = Math.min(meta.width, meta.height);
  const squared = await sharp(trimmed)
    .extract({
      left: Math.floor((meta.width - size) / 2),
      top: Math.floor((meta.height - size) / 2),
      width: size,
      height: size,
    })
    .toBuffer();
  console.log(`Squared to: ${size}x${size}`);

  // Save as source icon (1024x1024)
  await sharp(squared).resize(1024, 1024).png().toFile(`${destDir}/icon.png`);
  console.log("icon.png → 1024x1024");

  // Platform icons
  await sharp(squared).resize(32, 32).png().toFile(`${destDir}/32x32.png`);
  console.log("32x32.png");

  await sharp(squared).resize(128, 128).png().toFile(`${destDir}/128x128.png`);
  console.log("128x128.png");

  await sharp(squared).resize(256, 256).png().toFile(`${destDir}/128x128@2x.png`);
  console.log("128x128@2x.png");

  // Also save cleaned version to root
  await sharp(squared).resize(1024, 1024).png().toFile("icon.png");
  console.log("Root icon.png overwritten with 1024x1024 clean version");

  console.log("Done.");
}

main().catch(console.error);
