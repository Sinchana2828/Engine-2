import { Appliance } from '../models/Appliance.js';

/**
 * Get all repair records for the authenticated user
 * GET /api/repairs
 * Query params: status, applianceId, repairType, search, sortBy
 */
export const getAllRepairs = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { status, applianceId, repairType, search, sortBy } = req.query;

    // 1. Fetch all appliances belonging to this user
    let applianceQuery = { userId };
    if (applianceId && applianceId !== 'All') {
      applianceQuery._id = applianceId;
    }

    const appliances = await Appliance.find(applianceQuery).sort({ createdAt: -1 });

    const currentYear = new Date().getFullYear();
    const allRepairs = [];
    let totalRepairs = 0;
    let completedRepairs = 0;
    let scheduledRepairs = 0;
    let inProgressRepairs = 0;
    let totalExpenses = 0;
    let preventativeExpenses = 0;
    let regularRepairExpenses = 0;

    // Appliance cost analysis array
    const costAnalysis = [];

    appliances.forEach((app) => {
      let appCumulativeRepairs = 0;
      let appRepairsCount = 0;

      if (app.repairHistory && app.repairHistory.length > 0) {
        app.repairHistory.forEach((repair) => {
          totalRepairs++;
          const repairCost = Number(repair.cost) || 0;

          if (repair.status === 'Completed') {
            completedRepairs++;
            totalExpenses += repairCost;
            appCumulativeRepairs += repairCost;

            if (repair.repairType === 'Preventative Maintenance') {
              preventativeExpenses += repairCost;
            } else {
              regularRepairExpenses += repairCost;
            }
          } else if (repair.status === 'Scheduled') {
            scheduledRepairs++;
          } else if (repair.status === 'In Progress') {
            inProgressRepairs++;
          }

          appRepairsCount++;

          allRepairs.push({
            id: repair._id,
            _id: repair._id,
            applianceId: app._id,
            applianceName: app.name,
            category: app.category,
            brand: app.brand,
            modelNumber: app.modelNumber || 'Standard Model',
            purchaseYear: app.purchaseYear,
            purchasePrice: app.purchasePrice,
            warrantyStatus: app.warrantyStatus,
            currentCondition: app.currentCondition,
            date: repair.date,
            description: repair.description,
            cost: repairCost,
            status: repair.status || 'Completed',
            technician: repair.technician || 'Certified Technician',
            invoiceNumber: repair.invoiceNumber || '',
            repairType: repair.repairType || 'Repair',
            symptoms: repair.symptoms || [],
            notes: repair.notes || '',
            imageUrl: repair.imageUrl || '',
            aiCheck: repair.aiCheck || null,
            createdAt: repair.createdAt || repair.date
          });
        });
      }

      // Compute economic repair/replacement metrics for this appliance
      const age = Math.max(0, currentYear - app.purchaseYear);
      const purchasePrice = app.purchasePrice || 0;
      const ratio = purchasePrice > 0 ? (appCumulativeRepairs / purchasePrice) * 100 : 0;

      let recommendation = 'Repair Recommended';
      if (ratio >= 50 || age >= 10 || app.currentCondition === 'Critical') {
        recommendation = 'Replacement Advised';
      } else if (ratio >= 25 || age >= 7 || app.currentCondition === 'Needs Inspection') {
        recommendation = 'Monitor Closely';
      }

      costAnalysis.push({
        applianceId: app._id,
        applianceName: app.name,
        category: app.category,
        brand: app.brand,
        modelNumber: app.modelNumber,
        purchaseYear: app.purchaseYear,
        ageInYears: age,
        purchasePrice,
        cumulativeRepairCost: appCumulativeRepairs,
        repairToPurchaseRatio: Number(ratio.toFixed(1)),
        repairsCount: appRepairsCount,
        currentCondition: app.currentCondition,
        warrantyStatus: app.warrantyStatus,
        recommendation
      });
    });

    // 2. Filter repairs
    let filtered = allRepairs.filter((r) => {
      // Status filter
      if (status && status !== 'All' && r.status !== status) {
        return false;
      }
      // Appliance filter
      if (applianceId && applianceId !== 'All' && String(r.applianceId) !== String(applianceId)) {
        return false;
      }
      // Repair type filter
      if (repairType && repairType !== 'All' && r.repairType !== repairType) {
        return false;
      }
      // Search term
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesDesc = r.description?.toLowerCase().includes(q);
        const matchesApp = r.applianceName?.toLowerCase().includes(q);
        const matchesBrand = r.brand?.toLowerCase().includes(q);
        const matchesTech = r.technician?.toLowerCase().includes(q);
        const matchesInv = r.invoiceNumber?.toLowerCase().includes(q);
        const matchesSymptoms = r.symptoms?.some((s) => s.toLowerCase().includes(q));
        if (!matchesDesc && !matchesApp && !matchesBrand && !matchesTech && !matchesInv && !matchesSymptoms) {
          return false;
        }
      }
      return true;
    });

    // 3. Sort repairs
    if (sortBy === 'date-asc') {
      filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
    } else if (sortBy === 'cost-desc') {
      filtered.sort((a, b) => b.cost - a.cost);
    } else if (sortBy === 'cost-asc') {
      filtered.sort((a, b) => a.cost - b.cost);
    } else {
      // Default: date-desc (newest first)
      filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    return res.json({
      success: true,
      data: {
        repairs: filtered,
        metrics: {
          totalRepairs,
          completedRepairs,
          scheduledRepairs,
          inProgressRepairs,
          totalExpenses,
          preventativeExpenses,
          regularRepairExpenses
        },
        costAnalysis
      }
    });
  } catch (error) {
    console.error('[Get All Repairs Error]:', error.message);
    next(error);
  }
};

/**
 * Log a new repair record
 * POST /api/repairs
 */
export const createRepair = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      applianceId,
      description,
      cost,
      technician,
      status,
      date,
      invoiceNumber,
      repairType,
      symptoms,
      notes,
      imageUrl,
      aiCheck
    } = req.body;

    if (!applianceId) {
      return res.status(400).json({
        success: false,
        message: 'Please select an appliance for this repair record.'
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Problem description is required.'
      });
    }

    if (cost === undefined || cost === null || Number(cost) < 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid non-negative repair cost is required.'
      });
    }

    // Verify appliance belongs to this user
    const appliance = await Appliance.findOne({ _id: applianceId, userId });
    if (!appliance) {
      return res.status(404).json({
        success: false,
        message: 'Appliance not found or you are not authorized to log repairs for it.'
      });
    }

    const newRepair = {
      description: description.trim(),
      cost: Number(cost),
      technician: technician ? technician.trim() : 'Certified Service Technician',
      status: status || 'Completed',
      date: date ? new Date(date) : new Date(),
      invoiceNumber: invoiceNumber ? invoiceNumber.trim() : '',
      repairType: repairType || 'Repair',
      symptoms: Array.isArray(symptoms) ? symptoms : [],
      notes: notes ? notes.trim() : '',
      imageUrl: imageUrl || '',
      aiCheck: aiCheck || null
    };

    appliance.repairHistory.push(newRepair);
    await appliance.save();

    const createdRecord = appliance.repairHistory[appliance.repairHistory.length - 1];

    return res.status(201).json({
      success: true,
      message: 'Repair record logged successfully!',
      data: {
        ...createdRecord.toObject(),
        applianceId: appliance._id,
        applianceName: appliance.name,
        category: appliance.category,
        brand: appliance.brand
      }
    });
  } catch (error) {
    console.error('[Create Repair Error]:', error.message);
    next(error);
  }
};

/**
 * Get single repair record by ID
 * GET /api/repairs/:id
 */
export const getRepairById = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const appliance = await Appliance.findOne({
      userId,
      'repairHistory._id': id
    });

    if (!appliance) {
      return res.status(404).json({
        success: false,
        message: 'Repair record not found or unauthorized.'
      });
    }

    const repair = appliance.repairHistory.id(id);

    return res.json({
      success: true,
      data: {
        ...repair.toObject(),
        applianceId: appliance._id,
        applianceName: appliance.name,
        category: appliance.category,
        brand: appliance.brand,
        modelNumber: appliance.modelNumber,
        purchaseYear: appliance.purchaseYear,
        purchasePrice: appliance.purchasePrice,
        warrantyStatus: appliance.warrantyStatus
      }
    });
  } catch (error) {
    console.error('[Get Repair By ID Error]:', error.message);
    next(error);
  }
};

/**
 * Update an existing repair record
 * PUT /api/repairs/:id
 */
export const updateRepair = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const {
      description,
      cost,
      technician,
      status,
      date,
      invoiceNumber,
      repairType,
      symptoms,
      notes,
      imageUrl
    } = req.body;

    const appliance = await Appliance.findOne({
      userId,
      'repairHistory._id': id
    });

    if (!appliance) {
      return res.status(404).json({
        success: false,
        message: 'Repair record not found or unauthorized to update.'
      });
    }

    const repair = appliance.repairHistory.id(id);
    if (!repair) {
      return res.status(404).json({
        success: false,
        message: 'Repair record not found.'
      });
    }

    if (description !== undefined) repair.description = description.trim();
    if (cost !== undefined) repair.cost = Number(cost);
    if (technician !== undefined) repair.technician = technician.trim();
    if (status !== undefined) repair.status = status;
    if (date !== undefined) repair.date = new Date(date);
    if (invoiceNumber !== undefined) repair.invoiceNumber = invoiceNumber.trim();
    if (repairType !== undefined) repair.repairType = repairType;
    if (symptoms !== undefined) repair.symptoms = Array.isArray(symptoms) ? symptoms : [];
    if (notes !== undefined) repair.notes = notes.trim();
    if (imageUrl !== undefined) repair.imageUrl = imageUrl;

    await appliance.save();

    return res.json({
      success: true,
      message: 'Repair record updated successfully!',
      data: {
        ...repair.toObject(),
        applianceId: appliance._id,
        applianceName: appliance.name,
        category: appliance.category,
        brand: appliance.brand
      }
    });
  } catch (error) {
    console.error('[Update Repair Error]:', error.message);
    next(error);
  }
};

/**
 * Delete a repair record
 * DELETE /api/repairs/:id
 */
export const deleteRepair = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const appliance = await Appliance.findOne({
      userId,
      'repairHistory._id': id
    });

    if (!appliance) {
      return res.status(404).json({
        success: false,
        message: 'Repair record not found or unauthorized to delete.'
      });
    }

    appliance.repairHistory.pull({ _id: id });
    await appliance.save();

    return res.json({
      success: true,
      message: 'Repair record deleted successfully!'
    });
  } catch (error) {
    console.error('[Delete Repair Error]:', error.message);
    next(error);
  }
};
