import { pipeline } from '../node_modules/@xenova/transformers/src/transformers.js';

console.log('Downloading Xenova/clip-vit-base-patch32...');
try {
  const classifier = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
  console.log('CLIP loaded successfully!');
} catch (e) {
  console.error('CLIP download failed:', e.message);
}
