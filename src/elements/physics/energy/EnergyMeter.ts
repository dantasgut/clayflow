import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { EnergyMeterSchema } from './schemas';

/** Dado de um `EnergyMeter`: os parâmetros do kernel, escritos pelo estágio a cada quadro. */
export interface EnergyMeterData {
    gravity: number[];
    counts: number[];
}

/**
 * Medidor de energia dos corpos rígidos e moles (Camada 3, spec 037): com ele na cena, os estágios da energia calculam,
 * depois dos solvers, a série temporal da energia de cada corpo — o `EnergyFlow` no canal `BodyEnergy` (no slot do
 * `RigidBody`: cinética, potencial, potência dissipada no passo e energia dissipada na janela) e o `SoftEnergyFlow` no
 * canal `SoftBodyEnergy` (um registro por `SoftBody`, com a elástica do algoritmo), ambos de 8 fatias. Sem ele, nada é
 * calculado nem alocado. A energia de um corpo se lê com `resources.read(corpo, 'energy')` (a fatia mais recente).
 */
export class EnergyMeter extends Entity<EnergyMeterData> implements Resource {
    /** Parâmetros (uniform `EnergyMeter`). */
    static readonly schema = EnergyMeterSchema;

    state: ResourceState = ResourceState.Uninitialized;

    constructor() {
        super();
        this.data = { gravity: [0, 0, 0, 0], counts: [0, 0, 0, 0] };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'params', role: 'uniform', schema: EnergyMeterSchema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
