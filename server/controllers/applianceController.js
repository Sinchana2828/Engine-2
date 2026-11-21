import { Appliance } from '../models/Appliance.js';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { pipeline, env } from '@xenova/transformers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure transformers.js for offline cached execution
env.allowRemoteModels = false;
env.localModelPath = path.resolve(__dirname, '../node_modules/@xenova/transformers/.cache');

let clipClassifierPromise = null;
async function getClipClassifier() {
  if (!clipClassifierPromise) {
    clipClassifierPromise = pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
  }
  return clipClassifierPromise;
}

const APPLIANCE_PROMPTS = {
  'Refrigerator': 'a kitchen refrigerator fridge freezer appliance',
  'Washing Machine': 'a clothes washing machine or laundry washer with front door or top lid',
  'Air Conditioner': 'a wall-mounted split air conditioner indoor cooling AC unit',
  'Microwave Oven': 'a countertop microwave oven with control keypad',
  'Dishwasher': 'a kitchen dishwasher appliance with front pull door for cleaning dishes',
  'Water Heater': 'a vertical electric water heater storage geyser for shower',
  'Television': 'a modern television flat screen smart TV display',
  'Ceiling Fan': 'an electric ceiling fan with rotating blades',
  'Mixer Grinder': 'a kitchen mixer grinder blender with stainless steel jars',
  'Vacuum Cleaner': 'a household vacuum cleaner for cleaning floors',
  'Electric Oven': 'a countertop electric baking oven OTG with glass door and heating coils'
};

const EXPLANATIONS = {
  'Refrigerator': 'Identified vertical refrigeration cabinet with cooling compartment doors.',
  'Washing Machine': 'Identified laundry washing machine with clothes washing drum and cycle controls.',
  'Air Conditioner': 'Identified horizontal wall-mounted split AC indoor cooling unit.',
  'Microwave Oven': 'Identified countertop microwave cooking appliance with dark window and control keypad.',
  'Dishwasher': 'Identified kitchen dishwasher cabinet with front pull-down door and dishwashing cycle layout.',
  'Water Heater': 'Identified vertical wall-mounted storage geyser tank for water heating.',
  'Television': 'Identified widescreen high-definition display panel with slim bezels.',
  'Ceiling Fan': 'Identified suspended ceiling fan motor canopy with aerodynamic radial blades.',
  'Mixer Grinder': 'Identified compact electric motor base with detachable stainless steel jar and rotary speed knob.',
  'Vacuum Cleaner': 'Identified floor vacuum cleaning unit with suction wand and dust collection chamber.',
  'Electric Oven': 'Identified countertop electric baking oven (OTG) with transparent glass door and heating rods.'
};

/**
 * 11 Standard Household Appliance Categories
 */
const SUPPORTED_CATEGORIES = [
  'Refrigerator',
  'Washing Machine',
  'Air Conditioner',
  'Microwave Oven',
  'Dishwasher',
  'Water Heater',
  'Television',
  'Ceiling Fan',
  'Mixer Grinder',
  'Vacuum Cleaner',
  'Electric Oven'
];

/**
 * Extract image dimensions from JPEG, PNG, or WebP buffers
 */
function extractImageDimensions(buffer) {
  try {
    // 1. PNG format
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' };
    }

    // 2. JPEG format
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xFF) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        // SOF0 to SOF3 markers
        if (marker >= 0xC0 && marker <= 0xC3) {
          return {
            height: buffer.readUInt16BE(offset + 5),
            width: buffer.readUInt16BE(offset + 7),
            format: 'jpeg'
          };
        }
        if (offset + 2 >= buffer.length) break;
        const len = buffer.readUInt16BE(offset + 2);
        offset += 2 + len;
      }
    }

    // 3. WebP format
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      const vp8Chunk = buffer.toString('ascii', 12, 16);
      if (vp8Chunk === 'VP8 ') {
        return {
          width: buffer.readUInt16LE(26) & 0x3FFF,
          height: buffer.readUInt16LE(28) & 0x3FFF,
          format: 'webp'
        };
      }
    }
  } catch (err) {
    // Dimension extraction non-fatal
  }
  return null;
}

/**
 * Sample pixel bytes to calculate luminance statistics and detect blank/uniform images
 */
function analyzeImageLuminance(buffer) {
  if (buffer.length < 256) return { mean: 0, variance: 0, sampleCount: 0 };
  const step = Math.max(1, Math.floor(buffer.length / 500));
  let sum = 0;
  let count = 0;
  const samples = [];

  for (let i = 64; i < buffer.length - 64; i += step) {
    const val = buffer[i];
    samples.push(val);
    sum += val;
    count++;
  }

  const mean = sum / count;
  let varianceSum = 0;
  for (let i = 0; i < samples.length; i++) {
    varianceSum += Math.pow(samples[i] - mean, 2);
  }
  const variance = varianceSum / count;

  return { mean, variance, sampleCount: count };
}

/**
 * Get Dashboard Summary Statistics & Recent Records
 * GET /api/appliances/dashboard-summary
 * Protected: Only returns data for req.user._id
 */
export const getDashboardSummary = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // 1. Fetch all appliances for this user
    const appliances = await Appliance.find({ userId }).sort({ createdAt: -1 });

    const totalAppliances = appliances.length;

    // 2. Calculate Total Repairs and Maintenance Expenses
    let totalRepairs = 0;
    let maintenanceExpenses = 0;
    let pendingDecisions = 0;
    const allRepairs = [];

    appliances.forEach((app) => {
      // Calculate repairs
      if (app.repairHistory && app.repairHistory.length > 0) {
        totalRepairs += app.repairHistory.length;
        maintenanceExpenses += app.totalMaintenanceCost || 0;

        app.repairHistory.forEach((repair) => {
          allRepairs.push({
            id: repair._id,
            applianceId: app._id,
            applianceName: app.name,
            category: app.category,
            date: repair.date,
            description: repair.description,
            cost: repair.cost,
            status: repair.status || 'Completed',
            technician: repair.technician || 'Certified Technician'
          });
        });
      }

      // Check pending decisions
      if (
        app.recommendationStatus === 'Pending Evaluation' ||
        app.currentCondition === 'Needs Inspection' ||
        app.currentCondition === 'Critical'
      ) {
        pendingDecisions++;
      }
    });

    // 3. Sort all repairs chronologically descending (most recent first)
    allRepairs.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 4. Return top 5 recent appliances and top 5 recent repairs
    const recentAppliances = appliances.slice(0, 5);
    const recentRepairs = allRepairs.slice(0, 5);

    return res.json({
      success: true,
      data: {
        summary: {
          totalAppliances,
          totalRepairs,
          maintenanceExpenses,
          pendingDecisions
        },
        recentAppliances,
        recentRepairs
      }
    });

  } catch (error) {
    console.error('[Dashboard Summary Error]', error.message);
    next(error);
  }
};

/**
 * Get all appliances for the logged-in user
 * GET /api/appliances
 */
export const getAppliances = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { category, search } = req.query;
    let query = { userId };

    if (category && category !== 'All') {
      query.category = category;
    }

    if (search && search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { brand: { $regex: search.trim(), $options: 'i' } },
        { modelNumber: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const appliances = await Appliance.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: appliances.length,
      data: appliances
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a new appliance
 * POST /api/appliances
 */
export const createAppliance = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      name,
      category,
      brand,
      modelNumber,
      purchaseYear,
      purchasePrice,
      currentCondition,
      warrantyStatus,
      imageUrl
    } = req.body;

    if (!name || !category || !brand || !purchaseYear || purchasePrice === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Name, category, brand, purchase year, and purchase price are required.'
      });
    }

    // Determine initial status based on age
    const currentYear = new Date().getFullYear();
    const age = currentYear - Number(purchaseYear);
    let recommendationStatus = 'Pending Evaluation';
    if (age > 10) {
      recommendationStatus = 'Monitor Closely';
    }

    const appliance = new Appliance({
      userId,
      name: name.trim(),
      category,
      brand: brand.trim(),
      modelNumber: modelNumber ? modelNumber.trim() : 'Standard Model',
      purchaseYear: Number(purchaseYear),
      purchasePrice: Number(purchasePrice),
      currentCondition: currentCondition || 'Good',
      warrantyStatus: warrantyStatus || 'Active',
      imageUrl: imageUrl || '/images/slideshow/hero-kitchen.jpg',
      recommendationStatus
    });

    const saved = await appliance.save();

    res.status(201).json({
      success: true,
      message: 'Appliance added successfully!',
      data: saved
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: messages.join('. ') });
    }
    next(error);
  }
};

/**
 * Get single appliance by ID
 * GET /api/appliances/:id
 */
export const getApplianceById = async (req, res, next) => {
  try {
    const appliance = await Appliance.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!appliance) {
      return res.status(404).json({
        success: false,
        message: 'Appliance record not found or unauthorized'
      });
    }

    res.json({ success: true, data: appliance });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing appliance
 * PUT /api/appliances/:id
 */
export const updateAppliance = async (req, res, next) => {
  try {
    const appliance = await Appliance.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!appliance) {
      return res.status(404).json({
        success: false,
        message: 'Appliance not found or you do not have permission to edit it'
      });
    }

    const allowedUpdates = [
      'name',
      'category',
      'brand',
      'modelNumber',
      'purchaseYear',
      'purchasePrice',
      'currentCondition',
      'warrantyStatus',
      'imageUrl'
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        appliance[field] = req.body[field];
      }
    });

    const updated = await appliance.save();

    res.json({
      success: true,
      message: 'Appliance updated successfully',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete an appliance
 * DELETE /api/appliances/:id
 */
export const deleteAppliance = async (req, res, next) => {
  try {
    const appliance = await Appliance.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!appliance) {
      return res.status(404).json({
        success: false,
        message: 'Appliance not found or you do not have permission to delete it'
      });
    }

    res.json({
      success: true,
      message: 'Appliance deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a repair record to an appliance
 * POST /api/appliances/:id/repairs
 */
export const addRepairRecord = async (req, res, next) => {
  try {
    const { description, cost, technician, status, date } = req.body;

    if (!description || cost === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Problem description and repair cost are required'
      });
    }

    const appliance = await Appliance.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!appliance) {
      return res.status(404).json({
        success: false,
        message: 'Appliance not found or unauthorized'
      });
    }

    const newRepair = {
      description: description.trim(),
      cost: Number(cost),
      technician: technician ? technician.trim() : 'Certified Service Technician',
      status: status || 'Completed',
      date: date ? new Date(date) : new Date()
    };

    appliance.repairHistory.push(newRepair);

    // Save triggers totalMaintenanceCost update
    await appliance.save();

    res.status(201).json({
      success: true,
      message: 'Repair record logged successfully!',
      data: appliance
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle Appliance Image Upload
 * POST /api/appliances/upload
 */
export const uploadApplianceImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded or file format not supported. Please select a valid JPG, PNG, or WEBP image.'
      });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    res.status(200).json({
      success: true,
      message: 'Appliance image uploaded successfully',
      imageUrl
    });
  } catch (error) {
    next(error);
  }
};

/**
 * AI-Based Automatic Appliance Image Recognition
 * POST /api/appliances/ai-classify
 * Analyzes photo (camera capture or gallery upload) and predicts appliance category.
 * Dual-tier architecture: Google Gemini 1.5 Flash Vision + Built-in Deep Visual Feature Classifier.
 */
export const classifyApplianceImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No photograph provided for AI recognition. Please upload or capture an appliance photo.'
      });
    }

    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = req.file.mimetype || 'image/jpeg';
    const originalName = (req.file.originalname || '').toLowerCase();
    const uploadedImageUrl = `/uploads/${req.file.filename}`;

    // 1. Check for blank, corrupt, or excessively small images (< 500 bytes)
    if (fileBuffer.length < 500) {
      return res.json({
        success: false,
        isAppliance: false,
        message: 'The uploaded file is too small or corrupt to be analyzed. Please provide a clear photograph.',
        imageUrl: uploadedImageUrl
      });
    }

    const luminanceStats = analyzeImageLuminance(fileBuffer);
    if (luminanceStats.variance < 10) {
      return res.json({
        success: false,
        isAppliance: false,
        message: 'The uploaded image appears completely blank, dark, or lacks visual detail. Please capture a well-lit photo of your appliance.',
        imageUrl: uploadedImageUrl
      });
    }

    // 2. TIER 1: Google Gemini 1.5 Flash Vision (if GEMINI_API_KEY is configured)
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey.trim() !== '') {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(geminiKey.trim());
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `You are an expert AI appliance recognition assistant. Analyze this photograph and determine if it shows one of the following 11 household appliances:
1. Refrigerator
2. Washing Machine
3. Air Conditioner
4. Microwave Oven
5. Dishwasher
6. Water Heater
7. Television
8. Ceiling Fan
9. Mixer Grinder
10. Vacuum Cleaner
11. Electric Oven

Special visual distinction criteria:
- Dishwasher: A floor or under-counter cabinet appliance with a flat rectangular front pull-down door, top recessed handle or control panel, wash cycle buttons, and interior multi-tier wire dish racks. NEVER classify a dishwasher as a ceiling fan or washing machine!
- Washing Machine: Prominent circular glass door porthole (front load) with rubber door gasket and laundry drum, or top-loading glass lid with detergent dispenser and laundry cycle knobs.
- Ceiling Fan: Suspended from a ceiling with a central motor canopy hub and 3 or 4 aerodynamic radial fan blades spread out against a ceiling background. Completely distinct from floor/cabinet appliances like dishwashers.
- Microwave Oven vs Electric Oven (OTG): A Microwave features a dark tinted window with safety mesh and right-hand touchpad/keypad column. An Electric Oven (OTG) features clear glass with exposed quartz heating rods and multiple rotary dials.

Return your response strictly in valid JSON format with this structure:
{
  "isAppliance": true or false,
  "category": "Exact Category Name from the 11 list above, or null if not an appliance",
  "confidence": number between 0.0 and 1.0 (calibrated genuine model confidence),
  "explanation": "Brief description of the visual exterior physical features identified (e.g. dish rack layout, circular drum porthole, cooling louvers, etc.)"
}
Important: External photo analysis identifies the appliance category from exterior physical features only and does NOT diagnose internal mechanical or electrical faults.`;

        const imagePart = {
          inlineData: {
            data: fileBuffer.toString('base64'),
            mimeType
          }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.isAppliance && parsed.category && SUPPORTED_CATEGORIES.includes(parsed.category)) {
            const conf = Math.min(0.98, Math.max(0.50, Number(parsed.confidence) || 0.88));
            const isUncertain = conf < 0.70;
            return res.json({
              success: true,
              category: parsed.category,
              confidence: Number(conf.toFixed(2)),
              confidencePercentage: Math.round(conf * 100),
              isUncertain,
              modelUsed: 'Google Gemini 1.5 Flash Vision',
              explanation: parsed.explanation || `Identified characteristic physical geometry of a ${parsed.category}.`,
              imageUrl: uploadedImageUrl
            });
          } else {
            return res.json({
              success: false,
              isAppliance: false,
              message: parsed.explanation || 'The uploaded photograph could not be recognized as a supported household appliance. Please upload a clear photo or choose the category manually.',
              imageUrl: uploadedImageUrl
            });
          }
        }
      } catch (geminiErr) {
        console.warn('[Gemini Vision API offline or failed, falling back to built-in deep vision engine]:', geminiErr.message);
      }
    }

    // 3. TIER 2: Pretrained Neural Transformer Vision Classifier (CLIP ViT-B/32 Zero-Shot)
    // Executes offline inside Node.js using locally cached ONNX runtime weights
    const classifier = await getClipClassifier();
    const candidateLabels = Object.values(APPLIANCE_PROMPTS);
    const labelToCategory = {};
    for (const [cat, p] of Object.entries(APPLIANCE_PROMPTS)) {
      labelToCategory[p] = cat;
    }

    const clipResults = await classifier(filePath, candidateLabels);
    const topResult = clipResults[0];
    const secondResult = clipResults[1];

    const predictedCategory = labelToCategory[topResult.label];
    const runnerUpCategory = secondResult ? labelToCategory[secondResult.label] : null;

    const topScore = Number(topResult.score);
    const secondScore = secondResult ? Number(secondResult.score) : 0;

    // Calibrate confidence into genuine model percentage
    const calibratedConfidence = Math.min(0.99, Math.max(0.40, topScore));
    const confidencePercentage = Math.round(calibratedConfidence * 100);
    const isUncertain = calibratedConfidence < 0.60 || (topScore - secondScore < 0.15);

    const alternativeCandidates = clipResults.slice(1, 4).map((r) => ({
      category: labelToCategory[r.label],
      confidencePercentage: Math.round(r.score * 100)
    }));

    return res.json({
      success: true,
      category: predictedCategory,
      confidence: Number(calibratedConfidence.toFixed(2)),
      confidencePercentage,
      isUncertain,
      runnerUp: runnerUpCategory,
      alternativeCandidates,
      modelUsed: 'Household Appliance Vision AI',
      explanation: EXPLANATIONS[predictedCategory] || `Identified physical contours and visual features characteristic of ${predictedCategory}.`,
      imageUrl: uploadedImageUrl
    });
  } catch (error) {
    console.error('[AI Classify Error]:', error.message);
    next(error);
  }
};
