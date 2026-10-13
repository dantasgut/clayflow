import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { forward } from './shaders';
import { Material } from './Material';

/** Dado de um `WireframeMaterial` (layout de `WireframeMaterial.schema`). */
export interface WireframeMaterialData {
    color: number[];
    roughness: number;
    metallic: number;
    _pad0: number;
    _pad1: number;
}

/** Material wireframe — desenha as edges das primitivas (topology line-list). */
export class WireframeMaterial extends Material<WireframeMaterialData> {
    /** StructSchema do WireframeMaterial (color + roughness + metallic). */
    static readonly schema = new StructSchema('WireframeMaterial', {
        color: FieldType.vec4f,
        roughness: FieldType.f32,
        metallic: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    });

    constructor(values: Partial<Pick<WireframeMaterialData, 'color'>> = {}) {
        super();
        this.data = {
            color: values.color ?? [1, 1, 1, 1],
            roughness: 1.0,
            metallic: 0.0,
            _pad0: 0,
            _pad1: 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'material',
                role: 'storage-ro',
                schema: WireframeMaterial.schema,
                storage: 'pool',
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_wireframe',
                role: 'render',
                shader: forward,
                entryPoints: ['vs_main', 'fs_main'],
                consumes: [
                    'CameraMatrices',
                    'WorldTransform',
                    'Renderable',
                    'RenderInstance',
                    { name: WireframeMaterial.schema.name, as: 'StandardMaterial' },
                ],
                topology: 'line-list',
            },
        ];
    }
}
