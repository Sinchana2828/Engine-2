import { pipeline, env } from '../node_modules/@xenova/transformers/src/transformers.js';
import { APPLIANCE_CATALOG } from '../../client/src/data/applianceCatalogData.js';
import path from 'path';
import fs from 'fs';

env.allowRemoteModels = false;
env.localModelPath = './server/node_modules/@xenova/transformers/.cache';

const classifier = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');

// Let's test multiple candidate prompt sets
const promptVariations = {
  v1: {
    'Refrigerator': 'a refrigerator fridge freezer kitchen appliance',
    'Washing Machine': 'a laundry washing machine or clothes washer',
    'Air Conditioner': 'a wall-mounted split air conditioner indoor unit',
    'Microwave Oven': 'a countertop microwave oven appliance',
    'Dishwasher': 'a kitchen dishwasher machine for washing dishes',
    'Water Heater': 'a storage water heater geyser tank for bathroom',
    'Television': 'a flat-screen television TV screen monitor',
    'Ceiling Fan': 'a ceiling fan with rotating blades',
    'Mixer Grinder': 'a kitchen mixer grinder blender with jars',
    'Vacuum Cleaner': 'a household vacuum cleaner machine',
    'Electric Oven': 'a toaster oven OTG electric baking oven'
  },
  v2: {
    'Refrigerator': 'a photo of a refrigerator, tall fridge freezer',
    'Washing Machine': 'a photo of a washing machine or clothes washer',
    'Air Conditioner': 'a photo of a wall air conditioner indoor unit AC',
    'Microwave Oven': 'a photo of a microwave oven appliance',
    'Dishwasher': 'a photo of a dishwasher appliance with front pull door',
    'Water Heater': 'a photo of an electric water heater geyser tank',
    'Television': 'a photo of a television TV screen display',
    'Ceiling Fan': 'a photo of a ceiling fan with blades',
    'Mixer Grinder': 'a photo of a mixer grinder blender with stainless jars',
    'Vacuum Cleaner': 'a photo of a vacuum cleaner machine',
    'Electric Oven': 'a photo of an electric baking oven OTG'
  }
};

for (const [name, prompts] of Object.entries(promptVariations)) {
  console.log(`\n=== Testing Prompt Set: ${name} ===`);
  const labels = Object.values(prompts);
  const labelToCat = {};
  for (const [cat, p] of Object.entries(prompts)) {
    labelToCat[p] = cat;
  }

  let passed = 0;
  let total = 0;

  for (const item of APPLIANCE_CATALOG) {
    const imgPath = path.resolve('client/public', item.image.replace(/^\//, ''));
    if (!fs.existsSync(imgPath)) continue;
    total++;

    const res = await classifier(imgPath, labels);
    const pred = labelToCat[res[0].label];
    if (pred === item.category) {
      passed++;
    } else {
      console.log(`  ✗ [${item.category}] ${item.brand} ${item.modelNumber} -> ${pred} (${(res[0].score*100).toFixed(1)}%)`);
    }
  }

  // User mixer
  const userMixer = 'C:/Users/Asus/.gemini/antigravity/brain/c29b0b8d-4b15-4d52-aa65-edc7ea43f4b4/.user_uploaded/media_1795238415361_d9e24bb8.jpg';
  if (fs.existsSync(userMixer)) {
    total++;
    const res = await classifier(userMixer, labels);
    const pred = labelToCat[res[0].label];
    if (pred === 'Mixer Grinder') passed++;
    else console.log(`  ✗ User Mixer -> ${pred}`);
  }

  console.log(`Result ${name}: ${passed} / ${total} (${(passed/total*100).toFixed(1)}%)`);
}
