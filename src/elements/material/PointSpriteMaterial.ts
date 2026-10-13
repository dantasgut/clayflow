import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { forward } from './shaders';
import { Material } from './Material';

/** Dado de um `PointSpriteMaterial` (layout de `PointSpriteMaterial.schema`). */
export interface PointSpriteMaterialData {
    color: number[];
    radius: number;
    _pad0: number;
    _pad1: number;
    _pad2: number;
}

/**
 * Material para point clouds — cada vertex vira um sprite/billboard de
 * `radius` pixels (topology point-list).
 */
export class PointSpriteMaterial extends Material<PointSpriteMaterialData> {
    /** StructSchema do PointSpriteMaterial (color + radius). */
    static readonly schema = new StructSchema('PointSpriteMaterial', {
        color: FieldType.vec4f,
        radius: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
        _pad2: FieldType.f32,
    });

    constructor(values: Partial<PointSpriteMaterialData> = {}) {
        super();
        this.data = {
            color: values.color ?? [1, 1, 1, 1],
            radius: values.radius ?? 0.05,
            _pad0: 0,
            _pad1: 0,
            _pad2: 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'material',
                role: 'storage-ro',
                schema: PointSpriteMaterial.schema,
                storage: 'pool',
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_pointsprite',
                role: 'render',
                shader: forward,
                entryPoints: ['vs_main', 'fs_main'],
                consumes: [
                    'CameraMatrices',
                    'WorldTransform',
                    'Renderable',
                    'RenderInstance',
                    { name: PointSpriteMaterial.schema.name, as: 'StandardMaterial' },
                ],
                topology: 'point-list',
            },
        ];
    }
}
