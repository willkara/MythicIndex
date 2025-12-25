import { chromium } from 'playwright';
import { readdir } from 'fs/promises';
import { join } from 'path';

const MOCKUPS_DIR = './page-mockups';
const SCREENSHOTS_DIR = './page-mockups/screenshots';

async function screenshotMockups() {
  // Get all HTML files in mockups directory
  const files = await readdir(MOCKUPS_DIR);
  const htmlFiles = files.filter(f => f.endsWith('.html'));

  if (htmlFiles.length === 0) {
    console.log('No HTML mockup files found');
    return;
  }

  // Launch browser
  console.log('Launching browser...');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Create screenshots directory
  await import('fs').then(fs => {
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }
  });

  // Screenshot each HTML file
  for (const filename of htmlFiles) {
    const name = filename.replace('.html', '');
    console.log(`Capturing: ${name}`);

    try {
      const filePath = join(process.cwd(), MOCKUPS_DIR, filename);
      await page.goto(`file://${filePath}`, {
        waitUntil: 'networkidle',
        timeout: 10000
      });

      // Wait a bit for Tailwind CDN to load
      await page.waitForTimeout(1500);

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
  console.log(`\n✓ All screenshots captured!`);
  console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}/`);
}

screenshotMockups().catch(console.error);
