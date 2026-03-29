// Enums — ciclo de vida e estado
export { PhysicsBodyState }    from './PhysicsBodyState';
export { PhysicsDirtyFlag }    from './PhysicsDirtyFlag';
export { GpuBufferState }      from './GpuBufferState';
export { ContactState }        from './ContactState';
export { WarmStartState }      from './WarmStartState';
export { ContactCacheState }   from './ContactCacheState';
export { LCPSolverPhase }      from './LCPSolverPhase';
export { XPBDConstraintState } from './XPBDConstraintState';

// Contratos de buffer CPU → GPU / GPU → CPU
export type { RigidBodyGpuData }    from './RigidBodyGpuData';
export type { RigidBodyGpuReadback } from './RigidBodyGpuReadback';
export type { ColliderGpuData }     from './ColliderGpuData';
export type { RBSimParamsData }     from './RBSimParamsData';

// Contrato de ciclo de vida físico
export type { PhysicsResource }  from './PhysicsResource';

// State pattern — handler de estado de simulação
export type { BodyStateHandler } from './BodyStateHandler';
export { BodyStateHandlerRegistry } from './BodyStateHandlerRegistry';
