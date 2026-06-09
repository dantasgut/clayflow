import type { EngineCore } from '../../../core/contracts/index';
import type { World } from '../../../scene/world/World';
import type { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import type { FlowRegistry } from '../../../scene/flows/FlowRegistry';
import type { Flow } from '../../../scene/flows/Flow';
import type { Resource } from '../../../scene/contracts/Resource';
import { LCPFlow } from './LCPFlow';
import { XPBDFlow } from './XPBDFlow';
import { FEMFlow } from './FEMFlow';
import { MPMFlow } from './MPMFlow';
import { SPHFlow } from './SPHFlow';
import { PBFFlow } from './PBFFlow';

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
    ['XPBDSoftSchema', (c, w, r) => new XPBDFlow(c, w, r)],
    ['FEMSchema', (c, w, r) => new FEMFlow(c, w, r)],
    ['MPMFluidSchema', (c, w, r) => new MPMFlow(c, w, r)],
    ['MPMSoftSchema', (c, w, r) => new MPMFlow(c, w, r, { bodyType: 'MPMSoftSchema' })],
    ['SPHSchema', (c, w, r) => new SPHFlow(c, w, r)],
    ['PBFSchema', (c, w, r) => new PBFFlow(c, w, r)],
]);

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
            if (flows.resolve(name) !== undefined) continue;
            flows.register(factory(core, world, resources));
        }
    }
}
