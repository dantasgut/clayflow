import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Dado de um `EulerianGrid` (layout de `EulerianGrid.schema`). */
export interface EulerianGridData {
    gridDim: readonly number[];
    cellSize: number;
    origin: readonly number[];
    cellCount: number;
    _pad0: number;
    _pad1: number;
    _pad2: number;
}

/**
 * Grid Eulerian (estacionário) — armazena velocidades e quantidades em
 * células fixas no espaço. Usado por MPM (P2G/G2P) e FLIP. Para neighbor
 * search Lagrangian (SPH/PBF), use `NeighborSearchGrid`.
 */
export class EulerianGrid extends Entity<EulerianGridData> implements Resource {
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

    constructor(values: Partial<Pick<EulerianGridData, 'gridDim' | 'cellSize' | 'origin'>> = {}) {
        super();
        const dim = values.gridDim ?? [32, 32, 32];
        const cellSize = values.cellSize ?? 0.1;
        const cellCount = (dim[0] ?? 0) * (dim[1] ?? 0) * (dim[2] ?? 0);
        this.data = {
            gridDim: dim,
            cellSize,
            origin: values.origin ?? [0, 0, 0, 0],
            cellCount,
            _pad0: 0,
            _pad1: 0,
            _pad2: 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'eulerian_grid', role: 'uniform', schema: EulerianGrid.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
