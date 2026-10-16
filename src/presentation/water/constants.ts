import { sharedConstant } from '../../scene/shaders/SharedConstant';

/**
 * Profundidade "sem água" das texturas de profundidade da superfície (valor de limpeza; profundidades reais ficam
 * muito abaixo). Fonte única para o estágio que limpa e os shaders que testam.
 */
export const WATER_NO_DEPTH = sharedConstant('WATER_NO_DEPTH', 1e9, 'f32');

/**
 * Limiar de "sem água" de quem lê profundidades já filtradas ou reamostradas (cáusticas, composição): a partir dele o
 * texel não tem água — a suavização mistura profundidades reais com `WATER_NO_DEPTH` na borda, e o que passa deste
 * limiar não é superfície.
 */
export const WATER_DEPTH_LIMIT = sharedConstant('WATER_DEPTH_LIMIT', 1e8, 'f32');
