import type { ValidationPlan } from '../../validation/affected-plan';

export function makePlan(overrides: Partial<ValidationPlan>): ValidationPlan {
  return {
    e2eSpecPaths: [],
    ignoredPaths: [],
    journeyImpactAcknowledgements: [],
    journeySelectionReasons: [],
    lintPaths: [],
    missingJourneyMappings: [],
    requiresFullE2e: false,
    testLayerSelectionReasons: [],
    testLayers: [],
    testTargets: [],
    toolingTestPaths: [],
    workspaceNames: [],
    workspaceSelectionReasons: [],
    ...overrides,
  };
}
