import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

export class NeighborSearchGrid extends Entity implements Resource {
    static readonly schema = new StructSchema('NeighborSearchGrid', {
        cellSize: FieldType.f32,
        gridDim: FieldType.vec3u,
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
        this.data = NeighborSearchGrid.schema.applyDefaults({
            cellSize,
            gridDim: dim,
            origin: values.origin ?? [0, 0, 0, 0],
            cellCount,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'neighbor_grid', role: 'uniform', schema: NeighborSearchGrid.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
