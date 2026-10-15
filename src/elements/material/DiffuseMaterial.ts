import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { DiffuseMaterialSchema } from './DiffuseMaterialSchema';
import { Material } from './Material';
import { diffuseSprite } from './shaders';

/** Dado de um `DiffuseMaterial` (layout de `DiffuseMaterial.schema`). */
export interface DiffuseMaterialData {
    /** Cor das gotículas de spray (RGBA linear). */
    spray_color: number[];
    /** Cor da espuma. */
    foam_color: number[];
    /** Cor das bolhas. */
    bubble_color: number[];
    /** Raios do sprite (m): spray, espuma, bolha, —. */
    radii: number[];
}

/** Opções do `DiffuseMaterial`. */
export interface DiffuseMaterialOptions {
    /** Cor das gotículas de spray (RGBA linear). Default [0,55, 0,7, 0,8, 1]. */
    readonly sprayColor?: readonly number[];
    /** Cor da espuma (RGBA linear). Default [0,95, 0,97, 1, 1]. */
    readonly foamColor?: readonly number[];
    /** Cor das bolhas (RGBA linear). Default [0,85, 0,92, 1, 1]. */
    readonly bubbleColor?: readonly number[];
    /** Raio das gotículas de spray (m). Default 0,004. */
    readonly sprayRadius?: number;
    /** Raio dos flocos de espuma (m). Default 0,008. */
    readonly foamRadius?: number;
    /** Raio das bolhas (m). Default 0,005. */
    readonly bubbleRadius?: number;
}

/**
 * Material das partículas secundárias de um fluido (spec 010): gotículas de spray (tom de água, Fresnel e reflexo),
 * flocos de espuma que se dissolvem com a vida e bolhas em anel — topologia `point-list` sobre a nuvem de pontos que o
 * `DiffuseFlow` escreve (tipo e fração de vida por vértice).
 */
export class DiffuseMaterial extends Material<DiffuseMaterialData> {
    /** StructSchema do material. */
    static readonly schema = DiffuseMaterialSchema;

    constructor(options: DiffuseMaterialOptions = {}) {
        super();
        this.data = {
            spray_color: [...(options.sprayColor ?? [0.55, 0.7, 0.8, 1])],
            foam_color: [...(options.foamColor ?? [0.95, 0.97, 1, 1])],
            bubble_color: [...(options.bubbleColor ?? [0.85, 0.92, 1, 1])],
            radii: [
                options.sprayRadius ?? 0.004,
                options.foamRadius ?? 0.008,
                options.bubbleRadius ?? 0.005,
                0,
            ],
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'material', role: 'storage-ro', schema: DiffuseMaterial.schema, storage: 'pool' },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_diffuse',
                role: 'render',
                shader: diffuseSprite,
                entryPoints: ['vs_main', 'fs_main'],
                consumes: [
                    'CameraMatrices',
                    'WorldTransform',
                    'Renderable',
                    'RenderInstance',
                    DiffuseMaterial.schema.name,
                ],
                topology: 'point-list',
            },
        ];
    }
}
