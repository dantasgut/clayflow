import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Grid Eulerian (estacionário) — armazena velocidades e quantidades em
 * células fixas no espaço. Usado por MPM (P2G/G2P) e FLIP. Para neighbor
 * search Lagrangian (SPH/PBF), use `NeighborSearchGrid`.
 */
export class EulerianGrid extends Entity implements Resource {
    /** StructSchema do EulerianGrid (gridDim + cellSize + origin + cellCount). */
    static readonly schema = new StructSchema('EulerianGrid', {
        gridDim: FieldType.vec3u,
        cellSize: FieldType.f32,
        origin: FieldType.vec4f,
        cellCount: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
        _pad2: FieldType.u32,
    });

    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    constructor(values: Record<string, unknown> = {}) {
        super();
        const dim = (values.gridDim ?? [32, 32, 32]) as readonly number[];
        const cellSize = (values.cellSize ?? 0.1) as number;
        const cellCount = (dim[0] ?? 0) * (dim[1] ?? 0) * (dim[2] ?? 0);
        this.data = EulerianGrid.schema.applyDefaults({
            gridDim: dim,
            cellSize,
            origin: values.origin ?? [0, 0, 0, 0],
            cellCount,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'eulerian_grid', role: 'uniform', schema: EulerianGrid.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
