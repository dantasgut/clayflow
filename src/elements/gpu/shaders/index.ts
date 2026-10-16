import {
    brdf,
    camera,
    color,
    fem,
    finite,
    linalg,
    lcp,
    mat,
    mpmWeights,
    noise,
    quat,
    sdf,
    sphKernels,
    xpbd,
} from './math';
import { atomicAlloc, fixedPoint, poolLive } from '../compute/shaders';

/**
 * Biblioteca de módulos WGSL de base do motor (spec 005): cada função matemática existe num único módulo, usado por
 * compute e por render. Estágios e extensões declaram os módulos de que dependem em `requires`.
 */
export const wgslLib = Object.freeze({
    quat,
    linalg,
    mat,
    camera,
    sdf,
    sphKernels,
    mpmWeights,
    xpbd,
    lcp,
    fem,
    noise,
    color,
    brdf,
    finite,
    fixedPoint,
    atomicAlloc,
    poolLive,
});
