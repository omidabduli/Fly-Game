/**
 * All tunable parameters in one place.
 *
 * Every number that shapes the fly, the swatter and the difficulty lives here,
 * so it can be checked against the literature (or re-tuned for gameplay)
 * without touching the simulation code.
 *
 * Each parameter is tagged with one of three categories (see PARAM_NOTES below,
 * which the in-game Science page renders):
 *
 *   [MEASURED]  a value (or range) reported in the cited experimental literature
 *   [MODEL]     an assumption of this simplified model (plausible, not measured)
 *   [GAMEPLAY]  tuned for fun/fairness, NOT a biological claim
 *
 * Units: millimetres (mm), seconds (s) for physics; delays are given in ms and
 * angles in degrees for readability (converted in code).
 *
 * Note: the ~99% escape rate is a gameplay target, not a measured property
 * of real Drosophila.
 */
import type { Dist } from '../math/rng';

export interface SimParams {
  sim: {
    /** fixed physics step (ms), independent of the render frame rate */
    dtMs: number;
    /** swatter history kept for delayed perception (ms) */
    perceptionBufferMs: number;
  };
  fly: {
    bodyLengthMm: number;
    capsuleHalfLengthMm: number;
    capsuleRadiusMm: number;
    massMg: number;
  };
  perception: {
    visualProcessingDelayMs: Dist;
    /** slow random drift of the visual latency (ms per 100 ms) */
    visualDelayDriftMs: number;
    /** relative sensory noise on angular size / expansion rate */
    angularNoise: number;
    /** baseline (ms) used to estimate swatter velocity/acceleration from percepts */
    kinematicsBaselineMs: number;
    velocityNoise: number;
    accelNoise: number;
    distanceNoise: number;
    sizeNoise: number;
  };
  looming: {
    lc4HalfDegS: number;
    lc4SlopeDegS: number;
    /** how much sideways (translational) image motion suppresses each looming channel */
    lc4TranslationSuppression: number;
    lplc2TranslationSuppression: number;
    lplc2HalfDeg: number;
    lplc2SlopeDeg: number;
    lplc2GateLowDegS: number;
    lplc2GateHighDegS: number;
    lc4Weight: number;
    lplc2Weight: number;
    gfTauMs: number;
    /** translational (sideways) motion that merely alerts */
    motionAlertHalfDegS: number;
    motionAlertSlopeDegS: number;
    motionAlertGain: number;
    neuralNoise: number;
  };
  escape: {
    alertThreshold: number;
    escapeThreshold: number;
    alertPrimingDrop: number;
    alertnessThresholdDrop: number;
    escapeDecisionDelayMs: Dist;
    motorInitiationDelayShortMs: Dist;
    motorInitiationDelayLongMs: Dist;
    motorInitiationDelayFlightMs: Dist;
    shortModeThetaDotDegS: number;
    groomingPenaltyMs: Dist;
    walkingPenaltyMs: Dist;
    landingPenaltyMs: Dist;
    alertLatencyReduction: number;
    refractoryMs: number;
  };
  takeoff: {
    jumpDurationShortMs: number;
    jumpDurationLongMs: number;
    jumpSpeedShort: number;
    jumpSpeedLong: number;
    voluntaryJumpSpeed: number;
    voluntaryJumpDurationMs: number;
    shortModeDirectionNoiseDeg: number;
    longModeDirectionNoiseDeg: number;
    shortModeTumbleDegS: number;
    minElevationDeg: number;
    maxElevationDeg: number;
  };
  flight: {
    escapeAccel: number;
    escapeMaxSpeed: number;
    escapeBurstMs: Dist;
    cruiseAccel: number;
    cruiseSpeed: Dist;
    dragPerS: number;
    maxTurnEscapeDegS: number;
    maxTurnCruiseDegS: number;
    lateralThrustFraction: number;
    verticalThrustFraction: number;
    saccadeIntervalMs: Dist;
    saccadeAngleDeg: Dist;
    cruiseAltitudeMm: Dist;
    clearanceMm: number;
    maxAltitudeMm: number;
    lookaheadS: number;
    boundaryMarginMm: number;
    swatterAvoidMarginMm: number;
  };
  walking: {
    speedMmS: Dist;
    boutS: Dist;
    turnNoise: number;
    stepToleranceMm: number;
  };
  behavior: {
    walkRate: number;
    groomRate: number;
    turnRate: number;
    spontaneousTakeoffRate: number;
    boredomTakeoffRate: number;
    boredomAfterS: number;
    groomBoutS: Dist;
    alertHoldMs: number;
    preemptiveTakeoffRate: number;
    alertnessDecayS: number;
    fearDecayS: number;
    annoyanceDecayS: number;
    confidenceRelaxS: number;
    energyFlightCostPerS: number;
    energyEscapeCost: number;
    energyRestGainPerS: number;
    energyFoodGainPerS: number;
  };
  landing: {
    candidateCount: number;
    approachAltitudeMm: number;
    approachGain: number;
    landingStartDistanceMm: number;
    touchdownSpeed: number;
    settleMs: number;
    nearRangeMm: [number, number];
    midRangeMm: [number, number];
    farRangeMm: [number, number];
    rangeProbabilities: [number, number, number];
    safetyRadiusMm: number;
    safetyFearRadiusMm: number;
    shelterWeight: number;
    temperature: number;
    cruiseBeforeLandingS: Dist;
    edgeInsetMm: number;
  };
  planner: {
    wThreat: number;
    wObstacle: number;
    wLanding: number;
    wNoise: number;
    wRepeat: number;
    wHandedness: number;
    azimuthCount: number;
    elevationsDeg: number[];
    horizonMinMs: number;
    horizonMaxMs: number;
    simStepMs: number;
    clearanceScaleMm: number;
    marginMm: number;
    marginGrowthMmPerS: number;
    /** extra margin per (mm/s of sideways swatter speed) per second of horizon */
    lateralUncertainty: number;
    /** time constant of the "braking hand" hypothesis for sideways swatter motion (ms) */
    brakingTauMs: number;
    /** closed-loop re-planning interval during escape flight (ms) */
    steerIntervalMs: number;
    /** a new course must beat the current one by this much (mm) to be adopted */
    steerHysteresisMm: number;
    obstacleLookaheadMm: number;
    emergencyProbability: number;
    blunderProbability: number;
    /** emergency (surprise) vectors are drawn only from routes at least this safe (mm) */
    emergencyMinClearanceMm: number;
    panicClearanceMm: number;
  };
  swatter: {
    headHalfWidthMm: number;
    headHalfHeightMm: number;
    headCornerMm: number;
    thicknessMm: number;
    flexMm: number;
    hoverClearanceMm: number;
    hoverFollowGain: number;
    hoverFollowMaxSpeed: number;
    hoverRiseMaxSpeed: number;
    lateralOmega: number;
    lateralZeta: number;
    maxLateralSpeed: number;
    maxLateralAccel: number;
    /** a committed downswing leaves little sideways authority */
    swingLateralOmega: number;
    swingMaxLateralAccel: number;
    prepMs: number;
    windUpMm: number;
    swingAccel: number;
    swingMaxSpeed: number;
    swingVariability: number;
    holdMs: number;
    recoverMs: number;
  };
  attack: {
    seriousGapMm: number;
    seriousAirborneGapMm: number;
    extremelyCloseMm: number;
    nearMissMm: number;
    closeMm: number;
  };
  difficulty: {
    targetPlayerSuccess: number;
    initialLevel: number;
    minLevel: number;
    maxLevel: number;
    gain: number;
    hitAlpha: number;
    closenessAlpha: number;
    targetCloseness: number;
    closenessScaleMm: number;
    closenessWeight: number;
    thresholdRange: [number, number];
    latencyRange: [number, number];
    takeoffRange: [number, number];
    predictionNoiseRange: [number, number];
    randomnessRange: [number, number];
    landingDistanceRange: [number, number];
  };
}

export const DEFAULT_PARAMS: SimParams = {
  sim: {
    dtMs: 1, // [MODEL] 1 kHz fixed step: fine enough for millisecond reaction timing
    perceptionBufferMs: 320,
  },
  fly: {
    bodyLengthMm: 3.2, // [MEASURED~] adult females ~2.5 mm body; + folded wings
    capsuleHalfLengthMm: 1.05, // [MODEL] collision capsule ~ body incl. folded wings (3.7 mm)
    capsuleRadiusMm: 0.8, // [MODEL]
    massMg: 0.9, // [MEASURED~] order of 1 mg
  },
  perception: {
    // Reaction stage 1, visualProcessingDelay: photoreceptors -> optic lobe -> looming neurons.
    visualProcessingDelayMs: { mean: 15, sd: 3, min: 9, max: 25 }, // [MODEL]
    visualDelayDriftMs: 1.0,
    angularNoise: 0.05, // [MODEL]
    kinematicsBaselineMs: 12, // [MODEL]
    velocityNoise: 0.08,
    accelNoise: 0.15,
    distanceNoise: 0.03,
    sizeNoise: 0.06,
  },
  looming: {
    lc4HalfDegS: 60, // [MODEL] LC4 ~ angular-velocity channel (von Reyn 2017; Ache 2019)
    lc4SlopeDegS: 24,
    lc4TranslationSuppression: 0.12, // [MODEL] LPLC2-style radial-motion opponency (Klapoetke 2017)
    lplc2TranslationSuppression: 0.4,
    lplc2HalfDeg: 30, // [MODEL] LPLC2 ~ angular-size channel for expanding objects (Klapoetke 2017; Ache 2019)
    lplc2SlopeDeg: 7,
    lplc2GateLowDegS: 20,
    lplc2GateHighDegS: 140,
    lc4Weight: 0.8, // [MODEL] linear summation in the GF (von Reyn 2017)
    lplc2Weight: 0.45,
    gfTauMs: 9, // [MODEL]
    motionAlertHalfDegS: 90,
    motionAlertSlopeDegS: 35,
    motionAlertGain: 0.42,
    neuralNoise: 0.012,
  },
  escape: {
    alertThreshold: 0.25, // [MODEL]
    escapeThreshold: 0.57, // [MODEL] GF "spike" threshold on normalized drive
    alertPrimingDrop: 0.12,
    alertnessThresholdDrop: 0.16,
    // Stage 2, escapeDecisionDelay: escape neuron crosses threshold -> escape direction committed.
    escapeDecisionDelayMs: { mean: 7, sd: 2.5, min: 4, max: 15 }, // [MODEL]
    // Stage 3, motorInitiationDelay: descending command -> legs push (short/long mode) or wing stroke change (flight).
    motorInitiationDelayShortMs: { mean: 4.5, sd: 1, min: 2.5, max: 7 }, // [MEASURED~] short-mode <7 ms (von Reyn 2014)
    motorInitiationDelayLongMs: { mean: 9, sd: 2, min: 7, max: 17 }, // [MEASURED~] long-mode >=7 ms (von Reyn 2014)
    motorInitiationDelayFlightMs: { mean: 4, sd: 1, min: 2, max: 7 }, // [MODEL] wings already beating
    shortModeThetaDotDegS: 150, // [MODEL] fast looms bias to short mode (von Reyn 2014)
    groomingPenaltyMs: { mean: 17, sd: 5, min: 7, max: 32 }, // [MODEL/GAMEPLAY] legs must be put down first
    walkingPenaltyMs: { mean: 3, sd: 1.5, min: 0, max: 8 },
    landingPenaltyMs: { mean: 14, sd: 4, min: 5, max: 26 },
    alertLatencyReduction: 0.25,
    refractoryMs: 220,
  },
  takeoff: {
    jumpDurationShortMs: 3.3, // [MEASURED] escape leg extension 3.3 ms (Card & Dickinson 2008)
    jumpDurationLongMs: 5.5, // [MEASURED] voluntary leg extension 5.5 ms (Card & Dickinson 2008)
    jumpSpeedShort: 680, // [GAMEPLAY] measured escape take-off ~480 mm/s (Card & Dickinson 2008)
    jumpSpeedLong: 600, // [GAMEPLAY]
    voluntaryJumpSpeed: 280, // [MEASURED] voluntary take-off ~280 mm/s (Card & Dickinson 2008)
    voluntaryJumpDurationMs: 5.5,
    shortModeDirectionNoiseDeg: 16, // [MODEL] short-mode escapes are less controlled
    longModeDirectionNoiseDeg: 5,
    shortModeTumbleDegS: 7000, // [MEASURED~] escape roll rates up to ~10 200 deg/s (Card & Dickinson 2008)
    minElevationDeg: 12,
    maxElevationDeg: 58,
  },
  flight: {
    escapeAccel: 38000, // [GAMEPLAY] mm/s^2
    escapeMaxSpeed: 1250, // [GAMEPLAY] measured max ~600 mm/s
    escapeBurstMs: { mean: 170, sd: 40, min: 90, max: 280 },
    cruiseAccel: 7000,
    cruiseSpeed: { mean: 330, sd: 70, min: 200, max: 480 }, // [MEASURED~] cruising ~350 mm/s
    dragPerS: 6,
    maxTurnEscapeDegS: 5000, // [MEASURED~] fast banked turns (Muijres 2014)
    maxTurnCruiseDegS: 2400, // [MODEL] saccade-like turns (Fry 2003)
    lateralThrustFraction: 0.45,
    verticalThrustFraction: 0.7,
    saccadeIntervalMs: { mean: 380, sd: 160, min: 120, max: 900 }, // [MODEL]
    saccadeAngleDeg: { mean: 80, sd: 35, min: 25, max: 160 },
    cruiseAltitudeMm: { mean: 55, sd: 30, min: 18, max: 140 },
    clearanceMm: 7,
    maxAltitudeMm: 640,
    lookaheadS: 0.12,
    boundaryMarginMm: 28,
    swatterAvoidMarginMm: 28,
  },
  walking: {
    speedMmS: { mean: 17, sd: 6, min: 6, max: 36 }, // [MEASURED~] 7-45 mm/s, ~28 typical (Mendes 2013)
    boutS: { mean: 1.2, sd: 0.6, min: 0.3, max: 3.5 },
    turnNoise: 1.6,
    stepToleranceMm: 2.6,
  },
  behavior: {
    walkRate: 0.2, // [GAMEPLAY] events per second while resting
    groomRate: 0.13,
    turnRate: 0.25,
    spontaneousTakeoffRate: 0.012,
    boredomTakeoffRate: 0.02,
    boredomAfterS: 22,
    groomBoutS: { mean: 2.6, sd: 1.0, min: 0.8, max: 5.5 },
    alertHoldMs: 700,
    preemptiveTakeoffRate: 0.35,
    alertnessDecayS: 35,
    fearDecayS: 12,
    annoyanceDecayS: 60,
    confidenceRelaxS: 120,
    energyFlightCostPerS: 0.018,
    energyEscapeCost: 0.05,
    energyRestGainPerS: 0.008,
    energyFoodGainPerS: 0.03,
  },
  landing: {
    candidateCount: 56,
    approachAltitudeMm: 26,
    approachGain: 5.5,
    landingStartDistanceMm: 16,
    touchdownSpeed: 140,
    settleMs: 90,
    nearRangeMm: [35, 110],
    midRangeMm: [110, 220],
    farRangeMm: [220, 420],
    rangeProbabilities: [0.3, 0.45, 0.25],
    safetyRadiusMm: 70,
    safetyFearRadiusMm: 120,
    shelterWeight: 0.8,
    temperature: 0.18,
    cruiseBeforeLandingS: { mean: 1.1, sd: 0.6, min: 0.25, max: 3.0 },
    edgeInsetMm: 3,
  },
  planner: {
    wThreat: 0.55, // [MODEL] escapeVector = 0.55*threat + 0.20*obstacle + 0.15*landing + 0.10*noise
    wObstacle: 0.2,
    wLanding: 0.15,
    wNoise: 0.1,
    wRepeat: 0.06,
    wHandedness: 0.05,
    azimuthCount: 16,
    elevationsDeg: [14, 28, 44],
    horizonMinMs: 30, // [MODEL] predict the swatter 30-150 ms ahead
    horizonMaxMs: 150,
    simStepMs: 1.5,
    clearanceScaleMm: 30,
    marginMm: 2,
    marginGrowthMmPerS: 120,
    lateralUncertainty: 0.12,
    brakingTauMs: 45,
    steerIntervalMs: 15, // [MODEL] visually guided steering during evasive flight (Muijres 2014)
    steerHysteresisMm: 10,
    obstacleLookaheadMm: 45,
    emergencyProbability: 0.04,
    blunderProbability: 0.003,
    emergencyMinClearanceMm: 12,
    panicClearanceMm: -10,
  },
  swatter: {
    headHalfWidthMm: 25, // [GAMEPLAY] compact 50x60 mm swatter head
    headHalfHeightMm: 30,
    headCornerMm: 11,
    thicknessMm: 3,
    flexMm: 4, // [GAMEPLAY] the mesh bends a little on impact
    hoverClearanceMm: 240,
    hoverFollowGain: 9,
    hoverFollowMaxSpeed: 500,
    hoverRiseMaxSpeed: 1600,
    lateralOmega: 30,
    lateralZeta: 0.95,
    maxLateralSpeed: 2600,
    maxLateralAccel: 45000,
    swingLateralOmega: 13, // [GAMEPLAY] the arm is busy swinging down
    swingMaxLateralAccel: 16000,
    prepMs: 55,
    windUpMm: 30,
    swingAccel: 26000, // [GAMEPLAY] ~2.7 g
    swingMaxSpeed: 3800, // [GAMEPLAY] 3.8 m/s at the head
    swingVariability: 0.05,
    holdMs: 110,
    recoverMs: 240,
  },
  attack: {
    seriousGapMm: 12,
    seriousAirborneGapMm: 30,
    extremelyCloseMm: 5,
    nearMissMm: 20,
    closeMm: 50,
  },
  difficulty: {
    targetPlayerSuccess: 0.05, // [GAMEPLAY] ~1 catch per 20 serious attacks
    initialLevel: 0.5,
    minLevel: 0,
    maxLevel: 1,
    gain: 0.02,
    hitAlpha: 1 / 80,
    closenessAlpha: 1 / 25,
    targetCloseness: 0.115, // calibrated: mean closeness of a typical player at ~1% success (npm run benchmark)
    closenessScaleMm: 30,
    closenessWeight: 0.65,
    thresholdRange: [1.12, 0.88],
    latencyRange: [1.1, 0.9],
    takeoffRange: [0.94, 1.06],
    predictionNoiseRange: [1.3, 0.7],
    randomnessRange: [1.2, 0.8],
    landingDistanceRange: [0.85, 1.15],
  },
};

/** Multipliers applied on top of the base parameters (per-fly genome * difficulty * lab). */
export interface Modulation {
  thresholdScale: number;
  latencyScale: number;
  takeoffScale: number;
  predictionNoiseScale: number;
  predictionHorizonMs: number | null;
  randomnessScale: number;
  landingDistanceScale: number;
  escapeEnabled: boolean;
  predictionEnabled: boolean;
}

export const NEUTRAL_MODULATION: Modulation = {
  thresholdScale: 1,
  latencyScale: 1,
  takeoffScale: 1,
  predictionNoiseScale: 1,
  predictionHorizonMs: null,
  randomnessScale: 1,
  landingDistanceScale: 1,
  escapeEnabled: true,
  predictionEnabled: true,
};

export function combineModulation(...mods: Partial<Modulation>[]): Modulation {
  const out: Modulation = { ...NEUTRAL_MODULATION };
  for (const m of mods) {
    if (m.thresholdScale !== undefined) out.thresholdScale *= m.thresholdScale;
    if (m.latencyScale !== undefined) out.latencyScale *= m.latencyScale;
    if (m.takeoffScale !== undefined) out.takeoffScale *= m.takeoffScale;
    if (m.predictionNoiseScale !== undefined) out.predictionNoiseScale *= m.predictionNoiseScale;
    if (m.randomnessScale !== undefined) out.randomnessScale *= m.randomnessScale;
    if (m.landingDistanceScale !== undefined) out.landingDistanceScale *= m.landingDistanceScale;
    if (m.predictionHorizonMs !== undefined && m.predictionHorizonMs !== null) out.predictionHorizonMs = m.predictionHorizonMs;
    if (m.escapeEnabled === false) out.escapeEnabled = false;
    if (m.predictionEnabled === false) out.predictionEnabled = false;
  }
  return out;
}

export function cloneParams(p: SimParams = DEFAULT_PARAMS): SimParams {
  return JSON.parse(JSON.stringify(p)) as SimParams;
}
