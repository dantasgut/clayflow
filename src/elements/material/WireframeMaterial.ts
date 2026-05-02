import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import forwardWGSL from '../gpu/wgsl/forward.wgsl?raw';
import { Material } from './Material';

/** Material wireframe — desenha as edges das primitivas (topology line-list). */
export class WireframeMaterial extends Material {
    /** StructSchema do WireframeMaterial (color + roughness + metallic). */
    static readonly schema = new StructSchema('WireframeMaterial', {
        color: FieldType.vec4f,
        roughness: FieldType.f32,
        metallic: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = WireframeMaterial.schema.applyDefaults({
            color: values.color ?? [1, 1, 1, 1],
            roughness: 1.0,
            metallic: 0.0,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'material', role: 'uniform', schema: WireframeMaterial.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_wireframe',
                role: 'render',
                shaderSource: forwardWGSL,
                entryPoints: ['vs_main', 'fs_main'],
                consumes: ['Camera', 'Transform'],
                topology: 'line-list',
            },
        ];
    }
}
