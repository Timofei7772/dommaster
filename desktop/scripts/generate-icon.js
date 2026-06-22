const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { buildIcoFromPngs } = require('../src/main/ico-builder');

const rootDir = path.resolve(__dirname, '..');
const sourceSvgPath = path.join(rootDir, 'assets', 'icon.svg');
const buildDir = path.join(rootDir, 'build');
const outputIcoPath = path.join(buildDir, 'icon.ico');
const sizes = [256, 128, 64, 32];

function toFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, '/')}`;
}

function findChromiumPath() {
  const playwrightRoot = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  if (!fs.existsSync(playwrightRoot)) {
    throw new Error(`Не найдена папка браузеров Playwright: ${playwrightRoot}`);
  }

  const candidates = fs.readdirSync(playwrightRoot)
    .map((name) => path.join(playwrightRoot, name))
    .filter((dirPath) => fs.statSync(dirPath).isDirectory())
    .map((dirPath) => path.join(dirPath, 'chrome-win64', 'chrome.exe'))
    .concat(
      fs.readdirSync(playwrightRoot)
        .map((name) => path.join(playwrightRoot, name))
        .filter((dirPath) => fs.statSync(dirPath).isDirectory())
        .map((dirPath) => path.join(dirPath, 'chrome-win', 'chrome.exe'))
    )
    .filter((candidate) => fs.existsSync(candidate))
    .sort()
    .reverse();

  if (!candidates.length) {
    throw new Error('Не найден Chromium от Playwright для генерации icon.ico');
  }

  return candidates[0];
}

function renderPngFromSvg(chromiumPath, size, outputPath) {
  execFileSync(chromiumPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    '--force-device-scale-factor=1',
    `--screenshot=${outputPath}`,
    toFileUrl(sourceSvgPath),
  ], {
    stdio: 'pipe',
  });
}

function main() {
  if (!fs.existsSync(sourceSvgPath)) {
    throw new Error(`Не найден исходный SVG для иконки: ${sourceSvgPath}`);
  }

  const chromiumPath = findChromiumPath();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smetaai-icon-'));

  try {
    const pngEntries = sizes.map((size) => {
      const pngPath = path.join(tempDir, `icon-${size}.png`);
      renderPngFromSvg(chromiumPath, size, pngPath);
      return {
        size,
        buffer: fs.readFileSync(pngPath),
      };
    });

    const icoBuffer = buildIcoFromPngs(pngEntries);
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(outputIcoPath, icoBuffer);
    console.log(`ICON_OK ${outputIcoPath}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
