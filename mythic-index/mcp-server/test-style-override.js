// Test custom style override functionality
const { readImageryYaml } = require('./dist/services/imagery-yaml.js');
const { getImageService } = require('./dist/services/images.js');
const { initImageService } = require('./dist/services/images.js');

async function test() {
  // Read the imagery data
  const imageryData = await readImageryYaml('character', 'aldwin-gentleheart');

  console.log('=== Imagery Data ===');
  console.log('Entity:', imageryData?.entity_type);
  console.log('Slug:', imageryData?.slug);
  console.log('Has custom_style_override:', !!imageryData?.custom_style_override);

  if (imageryData?.custom_style_override) {
    console.log('\n=== Custom Style ===');
    console.log(imageryData.custom_style_override);

    // Build options as the code does
    const options = {};
    options.style = imageryData.custom_style_override;

    console.log('\n=== Options Object ===');
    console.log(JSON.stringify(options, null, 2));

    // Check what the image service would do
    const imageService = getImageService();
    console.log('\n=== Would use custom style: ===', !!options.style);
  }
}

test().catch(console.error);
