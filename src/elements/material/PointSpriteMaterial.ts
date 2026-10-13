import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { forward } from './shaders';
import { Material } from './Material';

/**
 * Material para point clouds — cada vertex vira um sprite/billboard de
 * `radius` pixels (topology point-list).
 */
export class PointSpriteMaterial extends Material {
    /** StructSchema do PointSpriteMaterial (color + radius). */
    static readonly schema = new StructSchema('PointSpriteMaterial', {
        color: FieldType.vec4f,
        radius: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
        _pad2: FieldType.f32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = PointSpriteMaterial.schema.applyDefaults({
            color: values.color ?? [1, 1, 1, 1],
            radius: values.radius ?? 0.05,
        });
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
                    'Camera',
                    'WorldTransform',
                    'Renderable',
                    { name: PointSpriteMaterial.schema.name, as: 'StandardMaterial' },
                ],
                topology: 'point-list',
            },
        ];
    }
}
