import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import {
    lightTransmissionPoint,
    lightVolumeVisibilityPoint,
    skyCoverPoint,
} from '../../scene/points/lighting';
import {
    CloudCoverageFunction,
    type CloudCoverageOptions,
} from '../../extension/CloudCoverageFunction';
import { CloudShapeFunction, type CloudShapeOptions } from '../../extension/CloudShapeFunction';
import {
    CloudPressureFunction,
    type CloudPressureOptions,
} from '../../extension/CloudPressureFunction';
import { defaultCloudShapeGraph } from './defaultShape';
import { GpuWordSchema, wordBuffer } from '../../gpu/compute/schemas';
import {
    CLOUD_COVERAGE_PAGE,
    CLOUD_COVERAGE_RECORD_WORDS,
    CLOUD_COVERAGE_SIDE,
    CLOUD_DETAIL_SIZE,
    CLOUD_SHADOW_ATLAS,
    CLOUD_SHADOW_SLOT_COUNT,
    CLOUD_SHADOW_STRIDE,
    CLOUD_SCATTER_GLOBAL_WORDS,
    CLOUD_SCATTER_HEADER_WORDS,
    CLOUD_SCATTER_PAGE,
    CLOUD_SCATTER_PROBE_WORDS,
    CLOUD_SHADOW_KNOTS,
    CLOUD_SHAPE_SIZE,
    CLOUD_WEATHER_SIZE,
    CloudSchema,
    CloudShadowPageSchema,
    cloudCoverageLevels,
    cloudCoverageSlotCount,
    type CloudQuality,
} from './schemas';
import { CLOUD_TILE, cloudLightTransmission, cloudSkyCover, cloudVolumeVisibility } from './shaders';

/**
 * O tempo das nuvens (spec 041, R19): um campo de pressão em escala sinótica (centenas de km) dita onde há nuvens, de
 * que tipo e até que altura, e o vento que as leva. Sem `pressure`, o padrão de sistemas de alta e baixa da biblioteca
 * (nascem, crescem e se desfazem, levados pelo vento de condução — o `wind` da camada). Leste = +x, norte = −z.
 */
export interface CloudWeatherSettings {
    /** Latitude da cena (graus, −90 a 90): o parâmetro de Coriolis f = 2Ω sin φ e o sentido do giro. Default 45. */
    readonly latitude: number;
    /** Padrão: lado das células (m), no máximo um sistema por célula; também a escala do estêncil. Default 1 500 000. */
    readonly scale: number;
    /** Padrão: amplitude das baixas a 45° (Pa); escala com a rotação na latitude da cena. Default 1200. */
    readonly amplitude: number;
    /** Padrão: vida de um sistema (s), do nascimento ao fim. Default 172 800 (2 dias). */
    readonly lifetime: number;
    /** Atrito linear da camada limite (1/s): o vento cruza as isóbaras perto do chão e converge nas baixas. Default 6·10⁻⁵. */
    readonly friction: number;
    /** Tempo de formação (s): as nuvens se formam e se desfazem em direção ao que o tempo dita nesse tempo. Default 1200. */
    readonly formation: number;
    /** Tropopausa (m acima do chão; > `top`): o topo da casca, aonde chega a torre do cúmulo-nimbo. Default 11 000. */
    readonly tropopause: number;
    /** Padrão: semente (inteiro ≥ 0). Default 0. */
    readonly seed: number;
    /**
     * O vento da alta troposfera como múltiplo do vento da camada (o cisalhamento, ≥ 0): leva a bigorna do cúmulo-nimbo
     * para longe da torre. Default 2,5 (nas latitudes médias o vento perto da tropopausa é ~2–3 × o de 700 hPa).
     */
    readonly shear: number;
}

/** Valores de autoria do tempo (todos opcionais) e a função de pressão (grafo de nós ou WGSL do ponto `cloud_pressure`). */
export interface CloudWeatherValues extends Partial<CloudWeatherSettings> {
    /** Campo de pressão: grafo de nós ou WGSL do ponto `cloud_pressure`. Default: o padrão de sistemas da biblioteca. */
    readonly pressure?: CloudPressureOptions;
}

/** Os padrões do tempo. */
export const CLOUD_WEATHER_DEFAULTS: CloudWeatherSettings = {
    latitude: 45,
    scale: 1_500_000,
    amplitude: 1200,
    lifetime: 172_800,
    friction: 6e-5,
    formation: 1200,
    tropopause: 11_000,
    seed: 0,
    shear: 2.5,
};

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
    /**
     * O tempo (spec 041, R19): o campo de pressão dita a cobertura, o tipo, o topo e o vento das nuvens. Com ele, `coverage`
     * (número), `type` e `top` são o tempo bom; a casca vai da base à tropopausa. Sem ele, a camada de hoje.
     */
    readonly weather?: CloudWeatherValues;
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
    /** O tempo (R19), ou `undefined` sem ele. */
    weather: CloudWeatherSettings | undefined;
}

/** A qualidade do perfil alto (o padrão antes do `Renderer` adotar a camada). */
export const CLOUD_QUALITY_HIGH: CloudQuality = {
    steps: 128,
    lightSteps: 6,
    octaves: 3,
    panorama: [256, 128],
    panoramaSteps: 32,
    shadow: { texel: 50, budget: 128 },
    coverageExtent: 256_000,
    coverage: { texel: 31.25, budget: 128 },
    scatter: { size: [160, 32, 160], budget: 200, motion: 40, collisions: 48 },
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
    /** A bigorna (com o tempo): o vento da alta troposfera `cisalhamento·vento·t` (x, z), módulo o período da forma. */
    readonly anvil: readonly [number, number];
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
    /** A função de pressão do tempo (com a opção `weather.pressure`), anexada à entidade da camada. */
    readonly pressureFunction: CloudPressureFunction | undefined;

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
            weather: CloudLayer.weatherOf(values.weather),
        };
        if (values.weather !== undefined && typeof coverage !== 'number')
            throw new RangeError(
                'CloudLayer: com o tempo (weather), a cobertura é um número (o tempo bom); o tempo dita o resto',
            );
        CloudLayer.check(this.rawData);
        this.shapeFunction = new CloudShapeFunction(
            values.shape ?? { graph: defaultCloudShapeGraph() },
        );
        this.add(this.shapeFunction);
        this.coverageFunction =
            typeof coverage === 'number' ? undefined : new CloudCoverageFunction(coverage);
        if (this.coverageFunction !== undefined) this.add(this.coverageFunction);
        const pressure = values.weather?.pressure;
        this.pressureFunction =
            pressure === undefined ? undefined : new CloudPressureFunction(pressure);
        if (this.pressureFunction !== undefined) this.add(this.pressureFunction);
    }

    /** Os valores do tempo completos pelos padrões (sem a função de pressão), ou `undefined`. */
    private static weatherOf(
        values: Partial<CloudWeatherSettings> | undefined,
    ): CloudWeatherSettings | undefined {
        if (values === undefined) return undefined;
        const out: Record<string, number> = { ...CLOUD_WEATHER_DEFAULTS };
        for (const key of Object.keys(CLOUD_WEATHER_DEFAULTS)) {
            const v = (values as Record<string, unknown>)[key];
            if (v !== undefined) out[key] = v as number;
        }
        return out as unknown as CloudWeatherSettings;
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
        const w = d.weather;
        if (w === undefined) return;
        check(
            finite(w.latitude) && w.latitude >= -90 && w.latitude <= 90,
            `latitude ${w.latitude} em [−90, 90]`,
        );
        check(finite(w.scale) && w.scale > 0, `escala do tempo ${w.scale} deve ser > 0`);
        check(finite(w.amplitude) && w.amplitude >= 0, `amplitude ${w.amplitude} deve ser ≥ 0`);
        check(finite(w.lifetime) && w.lifetime > 0, `vida ${w.lifetime} deve ser > 0`);
        check(finite(w.friction) && w.friction > 0, `atrito ${w.friction} deve ser > 0`);
        check(finite(w.formation) && w.formation > 0, `formação ${w.formation} deve ser > 0`);
        check(
            finite(w.tropopause) && w.tropopause > d.top,
            `tropopausa ${w.tropopause} deve ser > topo ${d.top}`,
        );
        check(finite(w.shear) && w.shear >= 0, `cisalhamento ${w.shear} deve ser ≥ 0`);
        check(
            Number.isInteger(w.seed) && w.seed >= 0 && w.seed <= 0xffffffff,
            `semente ${w.seed} deve ser inteira em [0, 2³²)`,
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

    /**
     * O tempo (spec 041, R19), ou `undefined` sem ele. Atribuir valores (parciais: o resto fica) liga ou ajusta o tempo
     * no quadro seguinte, sem recompilar; `undefined` o desliga. A função de pressão é a da criação (`weather.pressure`).
     */
    get weather(): CloudWeatherSettings | undefined {
        return this.rawData.weather;
    }
    set weather(v: Partial<CloudWeatherSettings> | undefined) {
        if (v !== undefined && this.coverageFunction !== undefined)
            throw new RangeError(
                'CloudLayer: com o tempo (weather), a cobertura é um número (o tempo bom); o tempo dita o resto',
            );
        this.set({
            weather: CloudLayer.weatherOf(
                v === undefined ? undefined : { ...this.rawData.weather, ...v },
            ),
        });
    }

    /** O topo da casca (m): a tropopausa com o tempo, o `top` sem ele. */
    get shellTop(): number {
        return this.rawData.weather?.tropopause ?? this.rawData.top;
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
            || q.coverage.texel !== quality.coverage.texel
            || q.coverageExtent !== quality.coverageExtent
            || q.marchScale !== quality.marchScale
            || q.scatter.size.some((v, k) => v !== quality.scatter.size[k]);
        if (resized) this.redescribe(this.getDescriptors(), { ...this.rawData, quality });
        else this.data.quality = quality;
    }

    /**
     * Os deslocamentos do vento no tempo simulado `time` (s), em f64 (spec 041, R6): a forma `vento·t` e o detalhe
     * `vento·t` com a deriva vertical `0,1·|vento|·t` reduzidos módulo o período do volume (o volume é periódico: a
     * redução não salta), a cobertura `vento·t` (o referencial da função de cobertura) e a bigorna, levada pelo vento
     * da alta troposfera (`cisalhamento·vento·t`; R19).
     */
    windOffsets(time: number): CloudWindOffsets {
        const [wx, wz] = [this.rawData.wind[0]!, this.rawData.wind[1]!];
        const s = this.rawData.shapeScale;
        const d = this.rawData.detailScale;
        const k = this.rawData.weather?.shear ?? 1;
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
            anvil: [wrap(k * wx * time, s), wrap(k * wz * time, s)],
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const q = this.rawData.quality;
        const scatterPages =
            (q.scatter.size[0] / CLOUD_SCATTER_PAGE)
            * (q.scatter.size[1] / CLOUD_SCATTER_PAGE)
            * (q.scatter.size[2] / CLOUD_SCATTER_PAGE);
        const scatterHeader =
            CLOUD_SCATTER_GLOBAL_WORDS + scatterPages * CLOUD_SCATTER_HEADER_WORDS;
        const coverageLevels = cloudCoverageLevels(q);
        const coverageSlots = cloudCoverageSlotCount(coverageLevels);
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
            // O mapa de cobertura em níveis em volta da câmera (R21 rodada 19, T077): uma camada de 512² texels por nível
            // (o endereço toroidal), série por páginas (o alvo só; a C2 guarda o carimbo de cada página física e a época) — só as páginas
            // que entram na janela, mudam de conteúdo ou, com o conteúdo que muda no tempo, as mais velhas até o
            // orçamento são refeitas.
            {
                id: 'coverage',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: {
                    format: 'rgba8unorm',
                    width: CLOUD_COVERAGE_SIDE,
                    height: CLOUD_COVERAGE_SIDE,
                    depthOrArrayLayers: coverageLevels,
                    access: 'write-only',
                },
                history: {
                    depth: 1,
                    pages: { tile: [CLOUD_COVERAGE_PAGE, CLOUD_COVERAGE_PAGE, 1] },
                },
            },
            // O registro de cada página física do mapa de cobertura (a página global, o quadro do desenho, a assinatura),
            // série por páginas.
            {
                id: 'coveragePages',
                role: 'storage-rw',
                schema: GpuWordSchema,
                count: coverageSlots * CLOUD_COVERAGE_RECORD_WORDS,
                upload: 'never',
                history: { depth: 1, pages: { record: CLOUD_COVERAGE_RECORD_WORDS * 4 } },
            },
            // A lista das páginas do quadro do mapa de cobertura (a contagem e as páginas físicas), refeita a cada quadro.
            {
                id: 'coverageWork',
                role: 'storage-rw',
                schema: GpuWordSchema,
                count: 4 + coverageSlots,
                upload: 'never',
            },
            target('ambient', 'rgba16float', [2, 1]),
            // O mapa visto do sol por páginas (spec 041, R11 revisto): 16 nós de profundidade ótica por coluna, 4 por
            // camada, no atlas das páginas dos níveis — série por páginas (o alvo só; a C2 guarda o carimbo de cada
            // página física e a época): só as páginas inválidas são refeitas, as demais seguem onde estão.
            {
                id: 'shadow',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: {
                    format: 'rgba16float',
                    dimension: '3d',
                    width: CLOUD_SHADOW_ATLAS,
                    height: CLOUD_SHADOW_ATLAS,
                    depthOrArrayLayers: CLOUD_SHADOW_KNOTS / 4,
                    access: 'write-only',
                },
                history: { depth: 1, pages: { tile: [CLOUD_SHADOW_STRIDE, CLOUD_SHADOW_STRIDE] } },
            },
            // O registro de cada página física do mapa (o sol, o tempo e o quadro do desenho, a página global, a
            // assinatura do conteúdo, a célula do pivô, o degrau, as medidas e os nós que as provas comparam —
            // `cloud_shadow.wgsl`) e o estado dos mapas na troca de degrau (o de onde, o para onde e o peso), série por
            // páginas: o estado entre quadros da mistura dos dois mapas é dela.
            {
                id: 'shadowPages',
                role: 'storage-rw',
                schema: CloudShadowPageSchema,
                // As páginas e o registro do estado dos mapas (`CLOUD_SHADOW_STATE_SLOT`).
                count: CLOUD_SHADOW_SLOT_COUNT + 1,
                upload: 'never',
                history: { depth: 1, pages: { record: CloudShadowPageSchema.stride } },
            },
            // A lista das páginas do quadro (a contagem e as páginas físicas), refeita a cada quadro.
            {
                id: 'shadowWork',
                role: 'storage-rw',
                schema: GpuWordSchema,
                count: 4 + CLOUD_SHADOW_SLOT_COUNT,
                upload: 'never',
            },
            // O panorama, série por páginas de uma página só (T074): refeito no quadro em que o que ele mostra muda.
            target('panorama', 'rgba16float', q.panorama, {
                depth: 1,
                pages: { tile: [q.panorama[0], q.panorama[1]] },
            }),
            // A marcha: um valor por bloco 2 × 2 do alvo reconstruído (¼ da tela; 1/16 no perfil baixo) e a série
            // reconstruída (spec 037).
            target('trace', 'rgba16float', 2 * q.marchScale),
            // A profundidade da nuvem e a superfície até onde o valor foi marchado (r, g).
            target('traceDepth', 'rg32float', 2 * q.marchScale),
            // O histórico reprojetado no pixel marchado de cada bloco e a variância temporal guardada com ele (brilho e
            // transmitância), do passe por bloco, que a janela do gradiente de cada texel lê (T080).
            target('check', 'rgba16float', 2 * q.marchScale),
            target('checkNoise', 'rg32float', 2 * q.marchScale),
            target('march', 'rgba16float', q.marchScale, { depth: 2, filtered: true }),
            // A profundidade e a superfície (r, g) e o segundo momento temporal do valor (b: o brilho², a: a transmitância²).
            target('marchDepth', 'rgba32float', q.marchScale, { depth: 2 }),
            target('view', 'rgba16float', 1),
            // A lista dos blocos da tela com nuvem (T074): a marca de cada bloco de `CLOUD_TILE`² pixels (o aumento), a lista
            // empacotada (um texel por bloco da lista) e as palavras do despacho indireto da composição.
            target('tiles', 'r32uint', CLOUD_TILE.value),
            target('tileList', 'r32uint', CLOUD_TILE.value),
            { ...wordBuffer('tileArgs', 4 * 4, 'indirect'), allocation: 'onDemand' },
            // O cache de espalhamento por páginas (T023, R8; R11 revisto): as palavras globais (a geração da grade), o
            // registro de cada página de 8³ sondas (o sol e o quadro do último caminho, a geração, as sondas com nuvem) e
            // as sondas (a soma da luz dos caminhos em unidades da iluminância do sol e quantos), série por páginas de
            // buffer: só as páginas escolhidas no quadro caminham, as demais seguem onde estão.
            {
                id: 'scatter',
                role: 'storage-rw',
                schema: GpuWordSchema,
                count: scatterHeader + scatterPages * CLOUD_SCATTER_PAGE ** 3 * CLOUD_SCATTER_PROBE_WORDS,
                upload: 'never',
                history: {
                    depth: 1,
                    pages: {
                        record: CLOUD_SCATTER_PAGE ** 3 * CLOUD_SCATTER_PROBE_WORDS * 4,
                        offset: scatterHeader * 4,
                    },
                },
            },
            // O cache filtrado no espaço (o binomial 3 × 3 × 3), o que a marcha e o panorama leem: série por páginas
            // (refeitas só as sondas cuja vizinhança caminhou).
            {
                id: 'scatterFiltered',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: {
                    format: 'rgba16float',
                    dimension: '3d',
                    width: q.scatter.size[0],
                    // A parte do sol e a contagem na metade de baixo, a parte do céu na de cima (T074).
                    height: 2 * q.scatter.size[1],
                    depthOrArrayLayers: q.scatter.size[2],
                    access: 'write-only',
                },
                history: {
                    depth: 1,
                    pages: { tile: [CLOUD_SCATTER_PAGE, CLOUD_SCATTER_PAGE, CLOUD_SCATTER_PAGE] },
                },
            },
            // O trabalho do quadro do cache: a contagem, a lista das páginas escolhidas (a página e o esquecimento) e a
            // marca de cada página para o filtro.
            {
                id: 'scatterWork',
                role: 'storage-rw',
                schema: GpuWordSchema,
                count: 8 + 3 * scatterPages,
                upload: 'never',
            },
            // O tempo (R19): o estado (cobertura pedida, tipo, topo) no quadrado do tempo, série da 037 em 32 bits (o
            // relaxamento a e^(−Δt/τ) por quadro muda ~10⁻⁵: em 16 bits se perderia), e o vento das nuvens, a subida e a
            // frente dele (`rgba16float`, lido filtrado na reconstrução).
            {
                id: 'weather',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: {
                    format: 'rgba32float',
                    width: CLOUD_WEATHER_SIZE,
                    height: CLOUD_WEATHER_SIZE,
                    access: 'write-only',
                },
                history: { depth: 2 },
            },
            target('weatherWind', 'rgba16float', [CLOUD_WEATHER_SIZE, CLOUD_WEATHER_SIZE]),
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
            // A sombra nos pontos do ar dos froxels (spec 041, R21): uma amostra por quadro.
            point: lightVolumeVisibilityPoint,
            order: 25,
            pools: [],
            build: () => (this.rawData.active === 1 ? cloudVolumeVisibility : undefined),
        },
        {
            point: skyCoverPoint,
            order: 0,
            pools: [],
            build: () => (this.rawData.active === 1 ? cloudSkyCover : undefined),
        },
    ];
}
