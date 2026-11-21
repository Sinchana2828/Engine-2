/**
 * Gate 0 Academic Architecture: DecisionEngine OOP Module
 * Generates transparent decision recommendations with explanations.
 */

export class DecisionEngine {
  static evaluateAppliance(appliance) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - appliance.purchaseYear;
    const maintenanceSpend = appliance.totalMaintenanceCost || 0;
    const purchasePrice = appliance.purchasePrice || 1000;
    const spendRatio = (maintenanceSpend / purchasePrice) * 100;

    let decision = 'Continue Monitoring';
    let reasoning = [];

    if (spendRatio > 50) {
      decision = 'Consider Replacement';
      reasoning.push(`Total maintenance spending (₹${maintenanceSpend.toLocaleString('en-IN')}) exceeds 50% of the original unit purchase price (₹${purchasePrice.toLocaleString('en-IN')}).`);
    } else if (age >= 10) {
      decision = 'Consider Replacement';
      reasoning.push(`Unit age (${age} years) has reached expected manufacturer end-of-life cycle.`);
    } else if (spendRatio > 25 && age > 5) {
      decision = 'Continue Monitoring';
      reasoning.push(`Appliance is mid-lifecycle (${age} years) with moderate repair accumulation (₹${maintenanceSpend.toLocaleString('en-IN')}). Monitor closely for recurring failures.`);
    } else {
      decision = 'Repair';
      reasoning.push(`Unit is within healthy operational lifespan (${age} years) with economical maintenance history.`);
    }

    return {
      decision,
      age,
      maintenanceSpend,
      spendRatio: Math.round(spendRatio),
      reasoning
    };
  }
}

export default DecisionEngine;
