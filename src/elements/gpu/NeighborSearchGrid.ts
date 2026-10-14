import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Dado de um `NeighborSearchGrid` (layout de `NeighborSearchGrid.schema`). */
export interface NeighborSearchGridData {
    /** Aresta da célula. */
    cellSize: number;
    /** Células por eixo. */
    gridDim: readonly number[];
    /** Origem da grade. */
    origin: readonly number[];
    /** Número de células. */
    cellCount: number;
    /** Preenchimento do layout. */
    _pad0: number;
    /** Preenchimento do layout. */
    _pad1: number;
    /** Preenchimento do layout. */
    _pad2: number;
}

/**
 * Grid uniforme de spatial hashing — particiona o espaço em células de
 * lado `cellSize` para acelerar neighbor search SPH/PBF (O(N) vs. O(N²)).
 * Compartilhado entre `NeighborSearchPipeline` e os flows fluido.
 */
export class NeighborSearchGrid extends Entity<NeighborSearchGridData> implements Resource {
    /** StructSchema do NeighborSearchGrid (cellSize + gridDim + origin + cellCount). */
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

    constructor(
        values: Partial<Pick<NeighborSearchGridData, 'gridDim' | 'cellSize' | 'origin'>> = {},
    ) {
        super();
        const dim = values.gridDim ?? [32, 32, 32];
        const cellSize = values.cellSize ?? 0.1;
        const cellCount = (dim[0] ?? 0) * (dim[1] ?? 0) * (dim[2] ?? 0);
        this.data = {
            cellSize,
            gridDim: dim,
            origin: values.origin ?? [0, 0, 0, 0],
            cellCount,
            _pad0: 0,
            _pad1: 0,
            _pad2: 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'neighbor_grid', role: 'uniform', schema: NeighborSearchGrid.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
