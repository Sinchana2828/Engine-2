/**
 * Academic Theme 3: Search and Ranking System
 * Object-Oriented Ranking Engine Module (Gate 0 Architecture)
 */

export class RankingEngine {
  constructor(appliances = []) {
    this.appliances = appliances;
  }

  /**
   * Search appliances by keyword (name, brand, category)
   */
  search(keyword) {
    if (!keyword) return this.appliances;
    const lower = keyword.toLowerCase();
    return this.appliances.filter(item => 
      item.name.toLowerCase().includes(lower) ||
      item.brand.toLowerCase().includes(lower) ||
      item.category.toLowerCase().includes(lower)
    );
  }

  /**
   * Calculate Failure Risk Score (0 - 100)
   * Higher score = higher urgency to repair or replace
   */
  calculateRiskScore(appliance) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - appliance.purchaseYear;
    const repairCount = appliance.repairHistory ? appliance.repairHistory.length : 0;
    const costRatio = appliance.totalMaintenanceCost / (appliance.purchasePrice || 1);

    // Weighted scoring
    const ageWeight = Math.min(age * 5, 40); // Up to 40 pts for age
    const repairWeight = Math.min(repairCount * 15, 30); // Up to 30 pts for repair count
    const costWeight = Math.min(costRatio * 50, 30); // Up to 30 pts for cost accumulation

    return Math.round(ageWeight + repairWeight + costWeight);
  }

  /**
   * Rank appliances by replacement urgency (Theme 3 Core Engine)
   */
  rankByUrgency() {
    return [...this.appliances].sort((a, b) => {
      const scoreA = this.calculateRiskScore(a);
      const scoreB = this.calculateRiskScore(b);
      return scoreB - scoreA; // Descending rank
    });
  }
}

export default RankingEngine;
