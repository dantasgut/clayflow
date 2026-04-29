/**
 * Camada 3 — Elements API pública.
 *
 * Resources user-facing: geometrias paramétricas, materiais, lights,
 * physics bodies (RigidBody, SoftBody, MPMBody, SPHBody, PBFBody), colliders,
 * constraints, force fields, particle emitters, e os Flows que processam
 * cada categoria (LCPFlow, XPBDFlow, FEMFlow, MPMFlow, SPHFlow, PBFFlow).
 *
 * Cada classe expõe `getDescriptors()` (camadas C2 alocam buffers/bindings
 * automaticamente) e, quando relevante, `getFlowDescriptors()` (associa o
 * resource a um pool por algoritmo).
 *
 * @packageDocumentation
 */
export { Entity } from './Entity';

export * from './scene/index';
export * from './geometry/index';
export * from './material/index';
export * from './physics/bodies/index';
export * from './physics/forcefields/index';
export * from './physics/colliders/index';
export * from './physics/constraints/index';
export * from './physics/flows/index';
export * from './particles/index';
export * from './gpu/index';
