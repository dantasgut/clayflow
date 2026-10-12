import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { forward } from './shaders';
import { StandardMaterialSchema } from './StandardMaterialSchema';
import { Material } from './Material';

/**
 * Material PBR padrão — albedo + metallic-roughness. Renderizado pelo
 * `forward.wgsl` (BRDF Cook-Torrance simplificado).
 */
export class StandardMaterial extends Material {
    /** StructSchema do StandardMaterial (albedo + roughness + metallic). */
    static readonly schema = StandardMaterialSchema;

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = StandardMaterial.schema.applyDefaults({
            albedo: values.albedo ?? [1, 1, 1, 1],
            roughness: values.roughness ?? 0.5,
            metallic: values.metallic ?? 0.0,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'material',
                role: 'storage-ro',
                schema: StandardMaterial.schema,
                storage: 'pool',
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_standard',
                role: 'render',
                shader: forward,
                entryPoints: ['vs_main', 'fs_main'],
                consumes: ['Camera', 'WorldTransform', 'Renderable', 'StandardMaterial'],
                topology: 'triangle-list',
                cullMode: 'back',
            },
        ];
    }
}
