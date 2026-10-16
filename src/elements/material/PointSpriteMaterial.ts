import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { PointSpriteMaterialSchema } from './PointSpriteMaterialSchema';
import { pointSprite } from './shaders';
import { Material } from './Material';

/** Dado de um `PointSpriteMaterial` (layout de `PointSpriteMaterial.schema`). */
export interface PointSpriteMaterialData {
    /** Cor RGBA linear. */
    color: number[];
    /** Raio. */
    radius: number;
    /** Preenchimento do layout. */
    _pad0: number;
    /** Preenchimento do layout. */
    _pad1: number;
    /** Preenchimento do layout. */
    _pad2: number;
}

/**
 * Material de sprites — cada partícula de um corpo (`FluidBody`, `SoftBody`) ou cada vértice de uma geometria vira um
 * quad virado para a câmera de raio `radius` (unidades de mundo), desenhado como esfera iluminada (topologia
 * `point-list`).
 */
export class PointSpriteMaterial extends Material<PointSpriteMaterialData> {
    /** StructSchema do PointSpriteMaterial (cor + raio), struct WGSL próprio (spec 008). */
    static readonly schema = PointSpriteMaterialSchema;

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
                shader: pointSprite,
                entryPoints: ['vs_main', 'fs_main'],
                family: 'points',
                topology: 'point-list',
            },
        ];
    }

    /** Desenha corpos de partículas. */
    override get drawsParticles(): boolean {
        return true;
    }
}
