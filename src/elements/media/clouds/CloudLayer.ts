import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import { lightTransmissionPoint, skyCoverPoint } from '../../scene/points/lighting';
import {
    CloudCoverageFunction,
    type CloudCoverageOptions,
} from '../../extension/CloudCoverageFunction';
import { CloudShapeFunction, type CloudShapeOptions } from '../../extension/CloudShapeFunction';
import { defaultCloudShapeGraph } from './defaultShape';
import {
    CLOUD_DETAIL_SIZE,
    CLOUD_SCATTER_SUN_RING,
    CLOUD_SHADOW_KNOTS,
    CLOUD_SHAPE_SIZE,
    CloudSchema,
    type CloudQuality,
} from './schemas';
import { cloudLightTransmission, cloudSkyCover } from './shaders';

/** Valores de autoria de uma `CloudLayer` (spec 041). */
export interface CloudLayerValues {
    /** Altitude da base da camada (m acima do chão da cena, y = 0). Default 1500. */
    readonly base?: number;
    /** Altitude do topo (m acima do chão; > base). Default 4000. */
    readonly top?: number;
    /** Cobertura: número em [0, 1] (todo o céu) ou função (grafo de nós ou WGSL) da posição e do tempo. Default 0,5. */
    readonly coverage?: number | CloudCoverageOptions;
    /** Tipo em [0, 1]: 0 estrato, 0,5 cúmulo, 1 cúmulo-nimbo (contínuo). Default 0,5. */
    readonly type?: number;
    /** Extinção (1/m) na densidade 1. Default 0,04. */
    readonly density?: number;
    /** Albedo de espalhamento em [0, 1]. Default 0,99. */
    readonly albedo?: number;
    /** Diâmetro médio das gotículas (µm, 5–50): a fase de Mie aproximada (Jendersie & d'Eon 2023). Default 20. */
    readonly dropletDiameter?: number;
    /** Vento horizontal (m/s, [x, z] do mundo). Default [5, 0]. */
    readonly wind?: readonly [number, number];
    /** Forma: grafo de nós ou WGSL do ponto `cloud_shape`. Default: o grafo de Perlin-Worley da biblioteca. */
    readonly shape?: CloudShapeOptions;
    /** Metros por período do volume de forma. Default 12000. */
    readonly shapeScale?: number;
    /** Metros por período do volume de detalhe. Default 1800. */
    readonly detailScale?: number;
}

/** Dado de uma `CloudLayer`: os valores de autoria, a qualidade do perfil e o uniforme empacotado pelos estágios. */
export interface CloudLayerData {
    /** O uniforme (`CloudSchema`), escrito pelos estágios das nuvens a cada quadro. */
    params: [Record<string, number[]>];
    base: number;
    top: number;
    coverage: number;
    type: number;
    density: number;
    albedo: number;
    dropletDiameter: number;
    wind: number[];
    shapeScale: number;
    detailScale: number;
    /** A qualidade do perfil do `Renderer` (spec 041, R15). */
    quality: CloudQuality;
    /** 1 quando os alvos que as contribuições leem existem (a sombra, o panorama); escrito só quando muda. */
    active: number;
}

/** A qualidade do perfil alto (o padrão antes do `Renderer` adotar a camada). */
export const CLOUD_QUALITY_HIGH: CloudQuality = {
    steps: 128,
    lightSteps: 6,
    octaves: 3,
    panorama: [256, 128],
    panoramaSteps: 32,
    shadow: { size: 256, extent: 400_000, near: 3_000 },
    coverageExtent: 256_000,
    coverageSize: 1024,
    scatter: { size: [160, 32, 160], stride: 8, collisions: 48 },
    marchScale: 2,
};

/** Os quatro parâmetros da fase de Jendersie & d'Eon (2023, Eq. 4–7) pelo diâmetro das gotículas (µm). */
export function cloudPhaseParams(diameter: number): [number, number, number, number] {
    const d = diameter;
    return [
        Math.exp(-0.0990567 / (d - 1.67154)),
        Math.exp(-2.20679 / (d + 3.91029) - 0.428934),
        Math.exp(3.62489 - 8.29288 / (d + 5.52825)),
        Math.exp(-0.599085 / (d - 0.641583) - 0.665888),
    ];
}

/**
 * A truncagem da fase pelo diâmetro (spec 041, T023, R8; δ-M, Wiscombe 1977): o pico de frente a menos de `degrees` é
 * tratado como transmitido nos caminhos do cache de espalhamento. Devolve [cosseno do corte, fração da fase no núcleo
 * `fc`, chance da HG entre as partes de fora, acumulada da HG até o corte] — a HG pela acumulada fechada, a de Draine pela
 * integral numérica (empacotamento de parâmetros, como `cloudPhaseParams`).
 */
export function cloudPhaseTruncation(
    diameter: number,
    degrees = 2,
): [number, number, number, number] {
    const [gHG, gD, alpha, wD] = cloudPhaseParams(diameter);
    const cosCut = Math.cos((degrees * Math.PI) / 180);
    const hg = (c: number, g: number): number => {
        const d = 1 + g * g - 2 * g * c;
        return (1 - g * g) / (4 * Math.PI * d * Math.sqrt(d));
    };
    const cdf = (mu: number, g: number): number =>
        ((1 - g * g) / (2 * g)) * (1 / Math.sqrt(1 + g * g - 2 * g * mu) - 1 / (1 + g));
    const coreHG = 1 - cdf(cosCut, gHG);
    const draine = (c: number): number =>
        (hg(c, gD) * (1 + alpha * c * c)) / (1 + (alpha * (1 + 2 * gD * gD)) / 3);
    let coreD = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
        const c0 = 1 - (1 - cosCut) * (i / n) ** 2;
        const c1 = 1 - (1 - cosCut) * ((i + 1) / n) ** 2;
        coreD += 0.5 * (draine(c0) + draine(c1)) * (c0 - c1) * 2 * Math.PI;
    }
    const fc = (1 - wD) * coreHG + wD * coreD;
    return [cosCut, fc, ((1 - wD) * (1 - coreHG)) / (1 - fc), 1 - coreHG];
}

/** Resto em [0, period) (f64). */
const wrap = (v: number, period: number): number => ((v % period) + period) % period;

/** Deslocamentos do vento num instante (m): a forma e o detalhe reduzidos módulo o período, e a cobertura. */
export interface CloudWindOffsets {
    readonly shape: readonly [number, number, number];
    readonly detail: readonly [number, number, number];
    readonly coverage: readonly [number, number];
}

/**
 * Camada de nuvens volumétricas (Camada 3, spec 041): um meio participante entre duas altitudes sobre o planeta do
 * `Sky`, desenhado pela transferência radiativa (marcha em resolução reduzida com reconstrução temporal), com
 * autossombra, espalhamento múltiplo e fase de Mie; faz sombra na cena (`light_transmission`), entra no céu dos raios
 * que escapam (`sky_cover` → `scene_environment`) e na composição da tela atrás da névoa. Exige um `Sky` na cena.
 * Mudar valores vale no quadro seguinte sem recompilar; mudar a forma refaz os volumes de ruído na GPU.
 */
export class CloudLayer extends Entity<CloudLayerData> implements Resource {
    /** O uniforme da camada. */
    static readonly schema = CloudSchema;

    state: ResourceState = ResourceState.Uninitialized;

    /** A função de forma (o grafo padrão de Perlin-Worley sem a opção `shape`), anexada à entidade da camada. */
    readonly shapeFunction: CloudShapeFunction;
    /** A função de cobertura (com a opção `coverage` de função ou grafo), anexada à entidade da camada. */
    readonly coverageFunction: CloudCoverageFunction | undefined;

    constructor(values: CloudLayerValues = {}) {
        super();
        const coverage = values.coverage ?? 0.5;
        this.data = {
            params: [CloudSchema.applyDefaults({}) as Record<string, number[]>],
            base: values.base ?? 1500,
            top: values.top ?? 4000,
            coverage: typeof coverage === 'number' ? coverage : 1,
            type: values.type ?? 0.5,
            density: values.density ?? 0.04,
            albedo: values.albedo ?? 0.99,
            dropletDiameter: values.dropletDiameter ?? 20,
            wind: [...(values.wind ?? [5, 0])],
            shapeScale: values.shapeScale ?? 12_000,
            detailScale: values.detailScale ?? 1800,
            quality: CLOUD_QUALITY_HIGH,
            active: 0,
        };
        CloudLayer.check(this.rawData);
        this.shapeFunction = new CloudShapeFunction(
            values.shape ?? { graph: defaultCloudShapeGraph() },
        );
        this.add(this.shapeFunction);
        this.coverageFunction =
            typeof coverage === 'number' ? undefined : new CloudCoverageFunction(coverage);
        if (this.coverageFunction !== undefined) this.add(this.coverageFunction);
    }

    /** Confere os intervalos do contrato (lança `RangeError` nomeando o valor). */
    validate(): void {
        CloudLayer.check(this.rawData);
    }

    private static check(d: CloudLayerData): void {
        const check = (ok: boolean, message: string): void => {
            if (!ok) throw new RangeError(`CloudLayer: ${message}`);
        };
        const finite = (v: number): boolean => Number.isFinite(v);
        check(finite(d.base) && d.base >= 0, `base ${d.base} deve ser ≥ 0`);
        check(finite(d.top) && d.top > d.base, `topo ${d.top} deve ser > base ${d.base}`);
        check(
            finite(d.coverage) && d.coverage >= 0 && d.coverage <= 1,
            `cobertura ${d.coverage} em [0, 1]`,
        );
        check(finite(d.type) && d.type >= 0 && d.type <= 1, `tipo ${d.type} em [0, 1]`);
        check(finite(d.density) && d.density > 0, `densidade ${d.density} deve ser > 0`);
        check(finite(d.albedo) && d.albedo >= 0 && d.albedo <= 1, `albedo ${d.albedo} em [0, 1]`);
        check(
            finite(d.dropletDiameter) && d.dropletDiameter >= 5 && d.dropletDiameter <= 50,
            `diâmetro das gotículas ${d.dropletDiameter} µm em [5, 50]`,
        );
        check(d.wind.length === 2 && d.wind.every(finite), 'vento deve ter dois valores finitos');
        check(finite(d.shapeScale) && d.shapeScale > 0, `shapeScale ${d.shapeScale} deve ser > 0`);
        check(
            finite(d.detailScale) && d.detailScale > 0,
            `detailScale ${d.detailScale} deve ser > 0`,
        );
    }

    /** Muda um valor validando-o (o anterior volta se o novo for inválido). */
    private set(next: Partial<CloudLayerData>): void {
        CloudLayer.check({ ...this.rawData, ...next });
        for (const [k, v] of Object.entries(next))
            (this.data as unknown as Record<string, unknown>)[k] = v;
    }

    /** Altitude da base (m). */
    get base(): number {
        return this.rawData.base;
    }
    set base(v: number) {
        this.set({ base: v });
    }
    /** Altitude do topo (m). */
    get top(): number {
        return this.rawData.top;
    }
    set top(v: number) {
        this.set({ top: v });
    }
    /** Cobertura global (com uma função de cobertura, a função manda; este valor fica para fora do mapa). */
    get coverage(): number {
        return this.rawData.coverage;
    }
    set coverage(v: number) {
        this.set({ coverage: v });
    }
    /** Tipo em [0, 1]. */
    get type(): number {
        return this.rawData.type;
    }
    set type(v: number) {
        this.set({ type: v });
    }
    /** Extinção (1/m) na densidade 1. */
    get density(): number {
        return this.rawData.density;
    }
    set density(v: number) {
        this.set({ density: v });
    }
    /** Albedo de espalhamento. */
    get albedo(): number {
        return this.rawData.albedo;
    }
    set albedo(v: number) {
        this.set({ albedo: v });
    }
    /** Diâmetro médio das gotículas (µm). */
    get dropletDiameter(): number {
        return this.rawData.dropletDiameter;
    }
    set dropletDiameter(v: number) {
        this.set({ dropletDiameter: v });
    }
    /** Vento (m/s, [x, z]). */
    get wind(): readonly [number, number] {
        return [this.rawData.wind[0]!, this.rawData.wind[1]!];
    }
    set wind(v: readonly [number, number]) {
        this.set({ wind: [v[0], v[1]] });
    }
    /** Metros por período do volume de forma (mudar refaz os volumes). */
    get shapeScale(): number {
        return this.rawData.shapeScale;
    }
    set shapeScale(v: number) {
        this.set({ shapeScale: v });
    }
    /** Metros por período do volume de detalhe. */
    get detailScale(): number {
        return this.rawData.detailScale;
    }
    set detailScale(v: number) {
        this.set({ detailScale: v });
    }

    /** A qualidade atual (do perfil do `Renderer`). */
    get quality(): CloudQuality {
        return this.rawData.quality;
    }

    /**
     * Recebe a qualidade do perfil do `Renderer` (spec 041, T034): o panorama e o mapa visto do sol com outros tamanhos
     * são realocados pela C2.
     */
    fromRenderer(quality: CloudQuality): void {
        const q = this.rawData.quality;
        if (JSON.stringify(q) === JSON.stringify(quality)) return;
        const resized =
            q.panorama[0] !== quality.panorama[0]
            || q.panorama[1] !== quality.panorama[1]
            || q.shadow.size !== quality.shadow.size
            || q.coverageSize !== quality.coverageSize
            || q.marchScale !== quality.marchScale
            || q.scatter.size.some((v, k) => v !== quality.scatter.size[k]);
        if (resized) this.redescribe(this.getDescriptors(), { ...this.rawData, quality });
        else this.data.quality = quality;
    }

    /**
     * Os deslocamentos do vento no tempo simulado `time` (s), em f64 (spec 041, R6): a forma `vento·t` e o detalhe
     * `vento·t` com a deriva vertical `0,1·|vento|·t` reduzidos módulo o período do volume (o volume é periódico: a
     * redução não salta) e a cobertura
     * `vento·t` (o referencial da função de cobertura).
     */
    windOffsets(time: number): CloudWindOffsets {
        const [wx, wz] = [this.rawData.wind[0]!, this.rawData.wind[1]!];
        const s = this.rawData.shapeScale;
        const d = this.rawData.detailScale;
        return {
            shape: [wrap(wx * time, s), 0, wrap(wz * time, s)],
            // O detalhe anda com o vento e deriva para cima a 0,1·|vento|: a forma muda aos poucos sem desviar o
            // deslocamento da nuvem (o 1,5× de Schneider puxava a nuvem medida para 130 m em vez de 100).
            detail: [
                wrap(wx * time, d),
                wrap(0.1 * Math.hypot(wx, wz) * time, d),
                wrap(wz * time, d),
            ],
            coverage: [wx * time, wz * time],
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const q = this.rawData.quality;
        const volume = (id: string, size: number): GPUDescriptor => ({
            id,
            role: 'storage-texture',
            allocation: 'onDemand',
            textureShape: {
                format: 'rgba8unorm',
                dimension: '3d',
                width: size,
                height: size,
                depthOrArrayLayers: size,
                access: 'write-only',
            },
        });
        const target = (
            id: string,
            format: GPUTextureFormat,
            size: readonly [number, number] | number,
            history?: GPUDescriptor['history'],
        ): GPUDescriptor => ({
            id,
            role: 'storage-texture',
            allocation: 'onDemand',
            textureShape:
                typeof size === 'number'
                    ? { format, sizeFromCanvas: true, canvasDivisor: size, access: 'write-only' }
                    : { format, width: size[0], height: size[1], access: 'write-only' },
            ...(history === undefined ? {} : { history }),
        });
        const sampler = (id: string, address: GPUAddressMode): GPUDescriptor => ({
            id,
            role: 'sampler',
            samplerShape: {
                magFilter: 'linear',
                minFilter: 'linear',
                addressModeU: address,
                addressModeV: address,
                addressModeW: address,
            },
        });
        return [
            { id: 'params', role: 'uniform', schema: CloudLayer.schema },
            volume('shape', CLOUD_SHAPE_SIZE),
            volume('detail', CLOUD_DETAIL_SIZE),
            target('coverage', 'rgba8unorm', [q.coverageSize, q.coverageSize]),
            target('ambient', 'rgba16float', [2, 1]),
            // O mapa visto do sol: 16 nós de profundidade ótica por coluna, 4 por camada (spec 041, R11).
            {
                id: 'shadow',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: {
                    format: 'rgba16float',
                    dimension: '3d',
                    width: q.shadow.size,
                    height: q.shadow.size,
                    depthOrArrayLayers: CLOUD_SHADOW_KNOTS / 4,
                    access: 'write-only',
                },
            },
            target('panorama', 'rgba16float', q.panorama),
            // A marcha: um valor por bloco 2 × 2 do alvo reconstruído (¼ da tela; 1/16 no perfil baixo) e a série
            // reconstruída (spec 037).
            target('trace', 'rgba16float', 2 * q.marchScale),
            // A profundidade da nuvem e a superfície até onde o valor foi marchado (r, g).
            target('traceDepth', 'rg32float', 2 * q.marchScale),
            target('march', 'rgba16float', q.marchScale, { depth: 2, filtered: true }),
            target('marchDepth', 'rg32float', q.marchScale, { depth: 2 }),
            target('view', 'rgba16float', 1),
            // O cache de espalhamento (T023, R8): por sonda, a soma da luz dos caminhos (em unidades da iluminância do
            // sol, rgb) e quantos (a), série temporal da 037 (o quadro lê a fatia anterior e escreve a sua), lida filtrada.
            {
                id: 'scatter',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: {
                    format: 'rgba16float',
                    dimension: '3d',
                    width: q.scatter.size[0],
                    height: q.scatter.size[1],
                    depthOrArrayLayers: q.scatter.size[2],
                    access: 'write-only',
                },
                history: { depth: 2, filtered: true },
            },
            // O cache filtrado no espaço (o binomial 3 × 3 × 3 da fatia do quadro), o que a marcha e o panorama leem.
            {
                id: 'scatterFiltered',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: {
                    format: 'rgba16float',
                    dimension: '3d',
                    width: q.scatter.size[0],
                    height: q.scatter.size[1],
                    depthOrArrayLayers: q.scatter.size[2],
                    access: 'write-only',
                },
            },
            // A direção do sol com que cada fase de grupos de sondas caminhou pela última vez (um texel por fase, série da
            // 037): o sol que anda esquece a média da sonda na proporção do ângulo desde o caminho anterior dela (T023).
            {
                id: 'scatterSun',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: {
                    format: 'rgba32float',
                    width: CLOUD_SCATTER_SUN_RING,
                    height: 1,
                    access: 'write-only',
                },
                history: { depth: 2 },
            },
            sampler('noiseSampler', 'repeat'),
            sampler('clampSampler', 'clamp-to-edge'),
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    getSceneContributions(): readonly SceneContribution[] {
        return this.contributions;
    }

    /** Liga as contribuições (a sombra e o céu coberto) quando os alvos que elas leem existem (escrito só quando muda). */
    setActive(on: boolean): void {
        const active = on ? 1 : 0;
        if (this.rawData.active !== active) this.data.active = active;
    }

    private readonly contributions: readonly SceneContribution[] = [
        {
            point: lightTransmissionPoint,
            order: 25,
            pools: [],
            build: () => (this.rawData.active === 1 ? cloudLightTransmission : undefined),
        },
        {
            point: skyCoverPoint,
            order: 0,
            pools: [],
            build: () => (this.rawData.active === 1 ? cloudSkyCover : undefined),
        },
    ];
}
