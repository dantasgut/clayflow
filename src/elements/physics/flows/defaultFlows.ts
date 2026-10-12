import type { EngineCore } from '../../../core/contracts/index';
import type { World } from '../../../scene/world/World';
import type { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import type { FlowRegistry } from '../../../scene/flows/FlowRegistry';
import type { LegacyFlow as Flow } from '../../../scene/flows/LegacyFlow';
import type { Resource } from '../../../scene/contracts/Resource';
import { LCPFlow } from './LCPFlow';
import { XPBDFlow } from './XPBDFlow';
import { FEMFlow } from './FEMFlow';
import { MPMFlow } from './MPMFlow';
import { SPHFlow } from './SPHFlow';
import { PBFFlow } from './PBFFlow';
import type {
    FlowFactory as SlotFlowFactory,
    RegisterOptions,
} from '../../../scene/flows/FlowRegistry';
import { XPBDSoftSchema } from '../bodies/schemas/XPBDSoftSchema';
import { FEMSchema } from '../bodies/schemas/FEMSchema';
import { MPMFluidSchema } from '../bodies/schemas/MPMFluidSchema';
import { MPMSoftSchema } from '../bodies/schemas/MPMSoftSchema';

/** Constrói um Flow a partir das dependências de runtime (C1/C2). */
export type FlowFactory = (core: EngineCore, world: World, resources: ResourceSystem) => Flow;

/**
 * Mapa `schema.name → factory de Flow default`. Usado pelo auto-registro
 * (Application): ao inserir um body cujo `schema.name` não tem flow registrado,
 * a factory correspondente é instanciada e registrada — eliminando o
 * `flows.register(new XxxFlow(...))` manual. Registro manual continua possível
 * e tem precedência (o auto-registro só age quando `resolve(name)` é undefined).
 *
 * Não altera os `*Flow` nem os schemas — apenas referencia o que já existe.
 */
export const DEFAULT_FLOW_FACTORIES: ReadonlyMap<string, FlowFactory> = new Map<
    string,
    FlowFactory
>([
    ['LCPSchema', (c, w, r) => new LCPFlow(c, w, r)],
    ['SPHSchema', (c, w, r) => new SPHFlow(c, w, r)],
    ['PBFSchema', (c, w, r) => new PBFFlow(c, w, r)],
]);

/** Registro padrão de um solver no modelo de slots: factory e opções (fase, tipo de corpo, prioridade). */
export interface SolverRegistration {
    readonly factory: SlotFlowFactory;
    readonly options: RegisterOptions;
}

/**
 * Solvers padrão da Camada 3 registrados por factory na cena (`Application`): cada um é instanciado pela C2 quando o
 * primeiro corpo do seu `bodyType` é alocado. Os estágios ainda não migrados seguem pelo auto-registro abaixo até a
 * T030 da spec 006.
 */
export const DEFAULT_SOLVER_REGISTRATIONS: readonly SolverRegistration[] = [
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
];

/**
 * Para cada resource recém-inserido cujo `schema.name` tem factory default e
 * ainda não tem flow registrado, instancia e registra o flow correspondente.
 * Idempotente (guard por `flows.resolve`); registro manual prévio tem
 * precedência. Pura quanto a side-effects de GPU — só registra no FlowRegistry.
 */
export function autoRegisterFlows(
    added: readonly Resource[],
    flows: FlowRegistry,
    core: EngineCore,
    world: World,
    resources: ResourceSystem,
): void {
    for (const r of added) {
        for (const d of r.getDescriptors()) {
            const name = (d as { schema?: { name?: string } }).schema?.name;
            if (name === undefined) continue;
            const factory = DEFAULT_FLOW_FACTORIES.get(name);
            if (factory === undefined) continue;
            if (flows.resolveLegacy(name) !== undefined) continue;
            flows.register(factory(core, world, resources));
        }
    }
}
