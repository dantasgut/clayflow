import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import { environmentContributions } from './shaders';
import { EnvironmentMapSchema } from './schema';

/** Valores de um `EnvironmentMap`. */
export interface EnvironmentMapValues {
    /** Largura da imagem equirretangular (pixels; o dobro da altura numa panorâmica completa). */
    readonly width: number;
    /** Altura da imagem (pixels). */
    readonly height: number;
    /**
     * A radiância linear por pixel, RGBA em ordem de linhas (a primeira linha é o topo, o zênite), `width × height × 4`
     * valores — o que a aplicação decodificou do arquivo (HDR, PNG…): o motor não lê arquivos.
     */
    readonly pixels: Float32Array;
    /** Multiplica a radiância (a escala da imagem na da cena: com o sol a 100 000 lux, um HDR de céu em nits). Default 1. */
    readonly intensity?: number;
    /** Giro da imagem em volta do eixo vertical (rad). Default 0. */
    readonly yaw?: number;
    /** A imagem é também o fundo visível. Default `true`. */
    readonly background?: boolean;
}

/** Dado de um `EnvironmentMap` (layout de `EnvironmentMap.schema`). */
export interface EnvironmentMapData {
    intensity: number;
    yaw: number;
    background: number;
    _pad0: number;
    /** A imagem em meia precisão (RGBA), conteúdo do descritor `image`. */
    image: Uint16Array;
}

/**
 * Imagem do mundo (spec 039 refeita): uma panorâmica equirretangular em volta da cena — o que a água, o vidro e os metais
 * refletem e o que os raios que escapam veem (contribuição a `scene_environment`) e, com `background`, o fundo visível
 * (`scene_background`). A textura (`rgba16float`, amostrada com filtro, repetida na horizontal) recebe os pixels da
 * aplicação uma vez, pela C2 (o conteúdo do descritor `image`, spec 039). Um `Sky` faz o mesmo papel calculado; numa cena, um dos dois.
 */
export class EnvironmentMap extends Entity<EnvironmentMapData> implements Resource {
    static readonly schema = EnvironmentMapSchema;

    state: ResourceState = ResourceState.Uninitialized;

    /** Largura e altura da imagem. */
    readonly width: number;
    readonly height: number;
    /** Os pixels em meia precisão (RGBA16F), prontos para a textura. */
    readonly halfPixels: Uint16Array;

    constructor(values: EnvironmentMapValues) {
        super();
        const { width, height, pixels } = values;
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
            throw new RangeError(`EnvironmentMap: tamanho ${width} × ${height} inválido.`);
        if (pixels.length !== width * height * 4)
            throw new RangeError(
                `EnvironmentMap: ${pixels.length} valores para ${width} × ${height} × 4 (RGBA).`,
            );
        this.width = width;
        this.height = height;
        this.halfPixels = toHalf(pixels);
        this.data = {
            intensity: values.intensity ?? 1,
            yaw: values.yaw ?? 0,
            background: values.background === false ? 0 : 1,
            _pad0: 0,
            // A imagem em meia precisão: a C2 a envia à textura na alocação (spec 039).
            image: this.halfPixels,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'params', role: 'uniform', schema: EnvironmentMap.schema },
            {
                id: 'image',
                role: 'storage-texture',
                textureShape: {
                    format: 'rgba16float',
                    width: this.width,
                    height: this.height,
                    access: 'write-only',
                },
            },
            {
                id: 'sampler',
                role: 'sampler',
                samplerShape: {
                    magFilter: 'linear',
                    minFilter: 'linear',
                    addressModeU: 'repeat',
                    addressModeV: 'clamp-to-edge',
                },
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /** O ambiente dos raios e, com `background`, o fundo visível. */
    getSceneContributions(): readonly SceneContribution[] {
        return this.contributions;
    }

    private readonly contributions = environmentContributions(() => this.rawData.background === 1);
}

/** Meia precisão IEEE (round-to-nearest) de cada valor. */
function toHalf(values: Float32Array): Uint16Array {
    const out = new Uint16Array(values.length);
    const f = new Float32Array(1);
    const u = new Uint32Array(f.buffer);
    for (let i = 0; i < values.length; i++) {
        f[0] = Number.isFinite(values[i]!) ? Math.min(Math.max(values[i]!, -65504), 65504) : 0;
        const x = u[0]!;
        const sign = (x >>> 16) & 0x8000;
        const exp = ((x >>> 23) & 0xff) - 127 + 15;
        const mant = x & 0x7fffff;
        if (exp <= 0) {
            // Subnormal (ou zero).
            out[i] = exp < -10 ? sign : sign | ((mant | 0x800000) >> (1 - exp + 13));
        } else {
            const rounded = (exp << 10) + ((mant + 0x1000) >> 13);
            out[i] = sign | Math.min(rounded, 0x7bff);
        }
    }
    return out;
}
