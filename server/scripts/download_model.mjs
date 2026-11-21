import { pipeline } from '../node_modules/@xenova/transformers/src/transformers.js';

console.log('Testing image classification pipeline download...');
try {
  const classifier = await pipeline('image-classification', 'Xenova/mobilenet_v4_conv_small.e2400_r224_in1k');
  console.log('MobileNetV4 loaded successfully!');
} catch (err) {
  console.log('MobileNetV4 failed:', err.message);
  try {
    const classifier2 = await pipeline('image-classification', 'Xenova/vit-base-patch16-224');
    console.log('ViT loaded successfully!');
  } catch (err2) {
    console.log('ViT failed:', err2.message);
  }
}
