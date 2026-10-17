import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import {
    GI_GRID,
    GI_IRRADIANCE_TEXELS,
    GI_MAX_CASCADES,
    GI_MAX_PROBES,
    GI_PROBE_TEXTURE_SIZE,
    GI_SCREEN_TILE_MIN,
    GI_VISIBILITY_TEXELS,
    GlobalIlluminationSchema,
    ProbeStateSchema,
} from './schemas';
import { giContributions } from './points';

/** Nível de qualidade (raios por sonda, fração das sondas por quadro, fótons por quadro). */
export type GlobalIlluminationQuality = 'low' | 'medium' | 'high';

/** Valores de cada qualidade (spec 033, R9). */
export const GI_QUALITY: Readonly<
    Record<
        GlobalIlluminationQuality,
        {
            raysPerProbe: number;
            probeFraction: number;
            photons: number;
            screenRays: number;
            screenTile: number;
        }
    >
> = {
    low: { raysPerProbe: 64, probeFraction: 0.125, photons: 65536, screenRays: 8, screenTile: 16 },
    medium: {
        raysPerProbe: 128,
        probeFraction: 0.25,
        photons: 262144,
        screenRays: 16,
        screenTile: 8,
    },
    high: {
        raysPerProbe: 256,
        probeFraction: 0.5,
        photons: 1048576,
        screenRays: 32,
        screenTile: 4,
    },
};

/** Valores de uma `GlobalIllumination`. */
export interface GlobalIlluminationValues {
    /** Liga a iluminação global. Default `true`. */
    readonly enabled?: boolean;
    /** Qualidade (raios por sonda, fração por quadro, fótons). Default `'medium'`. */
    readonly quality?: GlobalIlluminationQuality;
    /** Rebatimentos da luz indireta, em 1–8. Default 3. */
    readonly bounces?: number;
    /** Raios por sonda (substitui o da qualidade): 32, 64, 128 ou 256. */
    readonly raysPerProbe?: number;
    /** Fração das sondas atualizadas por quadro, em (0, 1] (substitui a da qualidade). */
    readonly probeFraction?: number;
    /** Fótons por quadro para as cáusticas (substitui o da qualidade). */
    readonly photons?: number;
    /** Histerese do acúmulo nas sondas, em [0,8; 0,995]. Default 0,97. */
    readonly hysteresis?: number;
    /** Cascatas de sondas, em 1–4. Default 3. */
    readonly cascades?: number;
    /** Espaçamento das sondas da cascata mais fina (m); as seguintes dobram. Default 1. */
    readonly probeSpacing?: number;
    /** Cáusticas por fótons (spec 033, US5). Default `true`. */
    readonly caustics?: boolean;
    /**
     * Coleta final na tela (R2 adendo): sondas de tela a cada 8 × 8 pixels lançam raios das superfícies visíveis — a
     * luz rebatida de perto (cantos, sombras da luz rebatida) exata; as sondas do mundo dão o resto. Default `true`.
     */
    readonly screenGather?: boolean;
    /** Raios por sonda de tela por quadro (substitui o da qualidade): 4, 8, 16, 32 ou 64. */
    readonly screenRays?: number;
    /**
     * Pixels por lado do ladrilho de uma sonda de tela num alvo de 1080 linhas (substitui o da qualidade): 4, 8 ou 16;
     * dobra a cada dobro da altura (8 px em 4K com o 4 da qualidade alta: a mesma resolução angular). Menor resolve a
     * luz de perto em faces mais estreitas na tela, com mais raios por quadro.
     */
    readonly screenTile?: number;
    /**
     * Centro fixo do volume de sondas (m). Sem ele, as cascatas acompanham a câmera — o certo para cenas abertas; um
     * interior visto de fora (a câmera fora do volume que importa) fixa o centro nele.
     */
    readonly center?: readonly number[];
}

/** Dado de uma `GlobalIllumination`: os parâmetros de autoria. */
export interface GlobalIlluminationData {
    enabled: boolean;
    bounces: number;
    raysPerProbe: number;
    probeFraction: number;
    photons: number;
    hysteresis: number;
    cascades: number;
    probeSpacing: number;
    caustics: boolean;
    screenGather: boolean;
    screenRays: number;
    screenTile: number;
    /** Centro fixo do volume de sondas, ou vazio (as cascatas acompanham a câmera). */
    center: number[];
    /**
     * O uniform, num registro (escrito pelo estágio das sondas a cada quadro: cascatas, raios, rotação) — separado dos
     * valores de autoria, cujos nomes não são os do layout.
     */
    params: [Record<string, number[]>];
}

const RAYS = [32, 64, 128, 256] as const;
const SCREEN_RAYS = [4, 8, 16, 32, 64] as const;
const SCREEN_TILES = [4, 8, 16] as const;

/** Lado do atlas de um mapa octaédrico de `texels` com borda de 1 texel. */
export function giAtlasSize(texels: number): readonly [number, number] {
    const tile = texels + 2;
    return [GI_GRID[0] * GI_GRID[2] * tile, GI_GRID[1] * GI_MAX_CASCADES * tile];
}

/**
 * Valida os valores de autoria.
 * @throws RangeError fora dos intervalos documentados.
 */
function validate(d: Omit<GlobalIlluminationData, 'params'>): void {
    const check = (ok: boolean, what: string): void => {
        if (!ok) throw new RangeError(`GlobalIllumination: ${what}.`);
    };
    check(
        Number.isInteger(d.bounces) && d.bounces >= 1 && d.bounces <= 8,
        `bounces ${d.bounces} fora de 1–8`,
    );
    check(
        (RAYS as readonly number[]).includes(d.raysPerProbe),
        `raysPerProbe ${d.raysPerProbe} fora de {32, 64, 128, 256}`,
    );
    check(
        d.probeFraction > 0 && d.probeFraction <= 1,
        `probeFraction ${d.probeFraction} fora de (0, 1]`,
    );
    check(
        d.hysteresis >= 0.8 && d.hysteresis <= 0.995,
        `hysteresis ${d.hysteresis} fora de [0,8; 0,995]`,
    );
    check(
        Number.isInteger(d.cascades) && d.cascades >= 1 && d.cascades <= GI_MAX_CASCADES,
        `cascades ${d.cascades} fora de 1–${GI_MAX_CASCADES}`,
    );
    check(d.probeSpacing > 0, `probeSpacing ${d.probeSpacing} deve ser > 0`);
    check(
        (SCREEN_RAYS as readonly number[]).includes(d.screenRays),
        `screenRays ${d.screenRays} fora de {4, 8, 16, 32, 64}`,
    );
    check(
        (SCREEN_TILES as readonly number[]).includes(d.screenTile),
        `screenTile ${d.screenTile} fora de {4, 8, 16}`,
    );
    check(
        Number.isInteger(d.photons) && d.photons >= 0,
        `photons ${d.photons} deve ser inteiro ≥ 0`,
    );
}

/**
 * Iluminação global (Camada 3, spec 033): a luz rebatida da cena, física e estável, sem mudar materiais nem desenho.
 * Sondas em cascatas centradas na câmera lançam raios pela estrutura de raios (`RayScene`); cada acerto é sombreado com
 * o material da entidade (as mesmas funções `material` do desenho), a luz direta com raio de sombra e a irradiância das
 * sondas do rebatimento anterior; os raios que escapam leem o céu. As sondas guardam a irradiância e a visibilidade em
 * mapas octaédricos (a visibilidade de Chebyshev impede o vazamento pelas paredes) com acúmulo temporal no espaço delas.
 * Fótons das fontes pelos caminhos especulares dão as cáusticas de toda superfície. A luz indireta chega ao desenho pelo
 * ponto `scene_lighting` (`closure_indirect`); com ela na cena, os estágios padrão retiram o hemisfério. Mudar valores
 * vale no quadro seguinte, sem recompilar.
 */
export class GlobalIllumination extends Entity<GlobalIlluminationData> implements Resource {
    /** Parâmetros (uniform). */
    static readonly schema = GlobalIlluminationSchema;

    state: ResourceState = ResourceState.Uninitialized;

    constructor(values: GlobalIlluminationValues = {}) {
        super();
        const q = GI_QUALITY[values.quality ?? 'medium'];
        const data = {
            enabled: values.enabled ?? true,
            bounces: values.bounces ?? 3,
            raysPerProbe: values.raysPerProbe ?? q.raysPerProbe,
            probeFraction: values.probeFraction ?? q.probeFraction,
            photons: values.photons ?? q.photons,
            hysteresis: values.hysteresis ?? 0.97,
            cascades: values.cascades ?? 3,
            probeSpacing: values.probeSpacing ?? 1,
            caustics: values.caustics ?? true,
            screenGather: values.screenGather ?? true,
            screenRays: values.screenRays ?? q.screenRays,
            screenTile: values.screenTile ?? q.screenTile,
            center: values.center === undefined ? [] : [...values.center],
        };
        validate(data);
        this.data = {
            ...data,
            params: [GlobalIlluminationSchema.applyDefaults({}) as Record<string, number[]>],
        };
    }

    /** Aplica uma qualidade (raios por sonda, fração por quadro, fótons). */
    set quality(q: GlobalIlluminationQuality) {
        const v = GI_QUALITY[q];
        this.data.raysPerProbe = v.raysPerProbe;
        this.data.probeFraction = v.probeFraction;
        this.data.photons = v.photons;
        this.data.screenRays = v.screenRays;
        this.data.screenTile = v.screenTile;
    }

    /** Valida os valores atuais (o estágio chama antes de usá-los; um valor inválido mantém o anterior). */
    validate(): void {
        validate(this.rawData);
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const atlas = (id: string, format: GPUTextureFormat, texels: number): GPUDescriptor => {
            const [width, height] = giAtlasSize(texels);
            return {
                id,
                role: 'storage-texture',
                textureShape: { format, width, height, access: 'write-only' },
            };
        };
        const screen = (id: string, format: GPUTextureFormat): GPUDescriptor => ({
            id,
            role: 'storage-texture',
            textureShape: {
                format,
                sizeFromCanvas: true,
                canvasDivisor: GI_SCREEN_TILE_MIN,
                access: 'write-only',
            },
        });
        return [
            { id: 'params', role: 'uniform', schema: GlobalIllumination.schema },
            {
                id: 'probes',
                role: 'storage-rw',
                schema: ProbeStateSchema,
                count: GI_MAX_PROBES,
                upload: 'never',
            },
            // O estado das sondas para quem lê (o desenho, os raios): deslocamento e estado; a célula (módulo 2048).
            {
                id: 'probeTexture',
                role: 'storage-texture',
                textureShape: {
                    format: 'rgba16float',
                    width: GI_PROBE_TEXTURE_SIZE[0],
                    height: GI_PROBE_TEXTURE_SIZE[1],
                    access: 'write-only',
                },
            },
            atlas('irradiance', 'rgba16float', GI_IRRADIANCE_TEXELS),
            atlas('radiance', 'rgba16float', GI_IRRADIANCE_TEXELS),
            // Distância média e média do quadrado em rg (rgba16float: filtrável e de storage).
            atlas('visibility', 'rgba16float', GI_VISIBILITY_TEXELS),
            // Sondas de tela (R2 adendo), um texel por ladrilho (o menor): posição (xyz, w = válida), normal e irradiância.
            screen('screenProbe', 'rgba32float'),
            screen('screenNormal', 'rgba16float'),
            screen('screenIrradiance', 'rgba16float'),
            {
                id: 'sampler',
                role: 'sampler',
                samplerShape: {
                    magFilter: 'linear',
                    minFilter: 'linear',
                    addressModeU: 'clamp-to-edge',
                    addressModeV: 'clamp-to-edge',
                },
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /** A luz indireta em `scene_lighting` (e as cáusticas). */
    getSceneContributions(): readonly SceneContribution[] {
        return giContributions;
    }
}
