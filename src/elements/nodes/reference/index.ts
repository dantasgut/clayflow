// Referências em CPU dos nós da C3 (spec 031): a mesma regra em f64 (aritmética inteira exata nos ruídos), para os
// testes e o smoke `nodeGraphs` compararem com a GPU. Os casos de teste de cada nó de ponto — amostras, referência e
// tolerância — estão em `library.ts`.

export { gradientNoise3 } from './noise';
export {
    noiseCellular3,
    noiseFbm3,
    noiseGradient2,
    noiseGradient3,
    noiseValue3,
} from './noiseNodes';
export { colorRamp4, mapCurve4, mapRange } from './map';
export { smoothstep } from './math';
export { compare } from './condition';
export { spaceApplyNormal, spaceApplyPoint, spaceInverseAffine, spaceProjectPoint } from './space';
export { fieldBuiltin } from './field';
export { surfaceCurvature, surfaceMetric, surfacePrincipal } from './surface';
export { nodeCases } from './library';
export {
    caseSamples,
    type NodeCase,
    type NodeCaseScene,
    type NodeValue,
    type NodeValues,
} from './cases';

/** Referências dos nós de conjunto (spec 031, US3). */
export * as set from './set';
