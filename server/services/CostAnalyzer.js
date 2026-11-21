/**
 * Gate 0 Academic Architecture: CostAnalyzer OOP Module
 * Evaluates economic depreciation, repair quotes, and replacement thresholds.
 */

export class CostAnalyzer {
  /**
   * Compares estimated repair quote against replacement cost using the 50% Rule
   */
  static analyzeRepairVsReplace(appliance, estimatedRepairCost, replacementCost) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - appliance.purchaseYear;
    const replacementBenchmark = replacementCost || (appliance.purchasePrice * 1.15);
    const repairRatio = (estimatedRepairCost / replacementBenchmark) * 100;

    const thresholdExceeded = repairRatio >= 50;
    const isPastMidLife = age >= 7;

    return {
      age,
      estimatedRepairCost,
      replacementBenchmark,
      repairRatio: parseFloat(repairRatio.toFixed(1)),
      thresholdExceeded,
      isPastMidLife,
      recommendation: (thresholdExceeded || (isPastMidLife && repairRatio > 35)) 
        ? 'Consider Replacement' 
        : 'Proceed with Repair'
    };
  }
}

export default CostAnalyzer;
