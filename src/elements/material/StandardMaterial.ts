import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import forwardWGSL from '../gpu/wgsl/forward.wgsl?raw';
import { Material } from './Material';

/**
 * Material PBR padrão — albedo + metallic-roughness. Renderizado pelo
 * `forward.wgsl` (BRDF Cook-Torrance simplificado).
 */
export class StandardMaterial extends Material {
    /** StructSchema do StandardMaterial (albedo + roughness + metallic). */
    static readonly schema = new StructSchema('StandardMaterial', {
        albedo: FieldType.vec4f,
        roughness: FieldType.f32,
        metallic: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = StandardMaterial.schema.applyDefaults({
            albedo: values.albedo ?? [1, 1, 1, 1],
            roughness: values.roughness ?? 0.5,
            metallic: values.metallic ?? 0.0,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'material', role: 'uniform', schema: StandardMaterial.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_standard',
                role: 'render',
                shaderSource: forwardWGSL,
                entryPoints: ['vs_main', 'fs_main'],
                consumes: ['Camera', 'Transform'],
                topology: 'triangle-list',
                cullMode: 'back',
            },
        ];
    }
}
