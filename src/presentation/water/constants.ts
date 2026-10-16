import { sharedConstant } from '../../scene/shaders/SharedConstant';

/**
 * Profundidade "sem água" das texturas de profundidade da superfície (valor de limpeza; profundidades reais ficam
 * muito abaixo). Fonte única para o estágio que limpa e os shaders que testam.
 */
export const WATER_NO_DEPTH = sharedConstant('WATER_NO_DEPTH', 1e9, 'f32');
