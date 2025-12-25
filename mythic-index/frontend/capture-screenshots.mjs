import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { join } from 'path';

const SCREENSHOTS_DIR = './page-screenshots';
const DEV_SERVER_URL = 'http://localhost:5174';

// Pages to capture (with sample slugs for dynamic routes)
const pages = [
  { path: '/', name: 'home' },
  { path: '/canon', name: 'canon-browser' },
  { path: '/search', name: 'search' },
  { path: '/admin/upload', name: 'admin-upload' },
  { path: '/chapters/sample', name: 'chapter-reader' },
  { path: '/characters/sample', name: 'character-reader' },
  { path: '/locations/sample', name: 'location-reader' },
  { path: '/worldbuilding/sample', name: 'worldbuilding-reader' },
  { path: '/lore/sample', name: 'lore-reader' },
  { path: '/writer', name: 'writer-dashboard' },
  { path: '/writer/chapters/new', name: 'writer-chapter-new' },
  { path: '/writer/chapters/sample', name: 'writer-chapter-edit' },
  { path: '/writer/characters/new', name: 'writer-character-new' },
  { path: '/writer/characters/sample', name: 'writer-character-edit' },
  { path: '/writer/locations/new', name: 'writer-location-new' },
  { path: '/writer/locations/sample', name: 'writer-location-edit' },
  { path: '/writer/zones/new', name: 'writer-zone-new' },
  { path: '/writer/zones/sample', name: 'writer-zone-edit' },
  { path: '/writer/scenes/new', name: 'writer-scene-new' },
  { path: '/writer/scenes/sample', name: 'writer-scene-edit' },
];

async function captureScreenshots() {
  // Create screenshots directory
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  // Launch browser
  console.log('Launching browser...');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Capture each page
  for (const { path, name } of pages) {
    console.log(`Capturing: ${name} (${path})`);
    try {
      await page.goto(`${DEV_SERVER_URL}${path}`, {
        waitUntil: 'networkidle',
        timeout: 15000
      });

      // Wait a bit for any animations/loading
      await page.waitForTimeout(1000);

      // Take screenshot
      const screenshotPath = join(SCREENSHOTS_DIR, `${name}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });
      console.log(`  ✓ Saved to ${screenshotPath}`);
    } catch (error) {
      console.log(`  ✗ Failed: ${error.message}`);
    }
  }

  // Close browser
  await browser.close();
  console.log('\n✓ All screenshots captured!');
  console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}/`);
}

captureScreenshots().catch(console.error);
