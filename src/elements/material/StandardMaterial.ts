import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { forward } from './shaders';
import { StandardMaterialSchema } from './StandardMaterialSchema';
import { Material } from './Material';

/** Dado de um `StandardMaterial` (layout de `StandardMaterial.schema`). */
export interface StandardMaterialData {
    /** Cor base RGBA. */
    albedo: number[];
    /** Rugosidade. */
    roughness: number;
    /** Metalicidade. */
    metallic: number;
    /** Preenchimento do layout. */
    _pad0: number;
    /** Preenchimento do layout. */
    _pad1: number;
}

/**
 * Material PBR padrão — albedo + metallic-roughness. Renderizado pelo
 * `forward.wgsl` (BRDF Cook-Torrance simplificado).
 */
export class StandardMaterial extends Material<StandardMaterialData> {
    /** StructSchema do StandardMaterial (albedo + roughness + metallic). */
    static readonly schema = StandardMaterialSchema;

    constructor(values: Partial<StandardMaterialData> = {}) {
        super();
        this.data = {
            albedo: values.albedo ?? [1, 1, 1, 1],
            roughness: values.roughness ?? 0.5,
            metallic: values.metallic ?? 0.0,
            _pad0: 0,
            _pad1: 0,
        };
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
                consumes: [
                    'CameraMatrices',
                    'WorldTransform',
                    'Renderable',
                    'RenderInstance',
                    'StandardMaterial',
                ],
                topology: 'triangle-list',
                cullMode: 'back',
            },
        ];
    }
}
