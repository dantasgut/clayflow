import type { FlowFactory, RegisterOptions } from '../../../scene/flows/FlowRegistry';
import { FEMSchema } from '../bodies/schemas/FEMSchema';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { MPMFluidSchema } from '../bodies/schemas/MPMFluidSchema';
import { MPMSoftSchema } from '../bodies/schemas/MPMSoftSchema';
import { PBFSchema } from '../bodies/schemas/PBFSchema';
import { SPHSchema } from '../bodies/schemas/SPHSchema';
import { XPBDSoftSchema } from '../bodies/schemas/XPBDSoftSchema';
import { FEMFlow } from './FEMFlow';
import { LCPFlow } from './LCPFlow';
import { MPMFlow } from './MPMFlow';
import { PBFFlow } from './PBFFlow';
import { SPHFlow } from './SPHFlow';
import { SurfaceColliderFlow } from './SurfaceColliderFlow';
import { SurfaceCollider } from '../colliders/SurfaceCollider';
import { XPBDFlow } from './XPBDFlow';

/** Registro padrão de um solver: factory e opções (fase, tipo de corpo, prioridade). */
export interface SolverRegistration {
    readonly factory: FlowFactory;
    readonly options: RegisterOptions;
}

/**
 * Solvers padrão da Camada 3, registrados por factory na cena pela aplicação (`registerPresentationDefaults`). A C2
 * instancia cada um quando o primeiro corpo do seu `bodyType` (a chave do pool) é alocado e o anuncia por `flowReady`
 * depois de preparar slots e pipelines; nenhum solver é criado para tipos de corpo que a cena não usa. Para trocar um
 * solver, registre outra factory com prioridade maior, ou `flows.override(bodyType, factory, opções)`.
 */
export const DEFAULT_SOLVER_REGISTRATIONS: readonly SolverRegistration[] = [
    {
        // Campo dos colliders de superfície (spec 010): antes dos solvers, que o consultam no mesmo quadro.
        factory: (ctx) => new SurfaceColliderFlow(ctx),
        options: {
            type: 'SurfaceColliderFlow',
            phase: 'physics',
            bodyType: SurfaceCollider.schema.name,
            priority: 20,
        },
    },
    {
        factory: (ctx) => new LCPFlow(ctx),
        options: { type: 'LCPFlow', phase: 'physics', bodyType: LCPSchema.name, priority: 10 },
    },
    {
        factory: (ctx) => new XPBDFlow(ctx),
        options: { type: 'XPBDFlow', phase: 'physics', bodyType: XPBDSoftSchema.name, priority: 5 },
    },
    {
        factory: (ctx) => new FEMFlow(ctx),
        options: { type: 'FEMFlow', phase: 'physics', bodyType: FEMSchema.name },
    },
    {
        factory: (ctx) => new MPMFlow(ctx),
        options: { type: 'MPMFlow', phase: 'physics', bodyType: MPMFluidSchema.name },
    },
    {
        factory: (ctx) => new MPMFlow(ctx),
        options: { type: 'MPMFlow', phase: 'physics', bodyType: MPMSoftSchema.name },
    },
    {
        factory: (ctx) => new SPHFlow(ctx),
        options: { type: 'SPHFlow', phase: 'physics', bodyType: SPHSchema.name },
    },
    {
        factory: (ctx) => new PBFFlow(ctx),
        options: { type: 'PBFFlow', phase: 'physics', bodyType: PBFSchema.name },
    },
];
