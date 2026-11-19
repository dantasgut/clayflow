import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import { NONE } from '../../../scene/shaders/engineConstants';
import type { DirectionalLight } from '../DirectionalLight';
import { SkySchema } from './SkySchema';
import { skyContributions } from './points';

/** Tamanhos das tabelas (Hillaire 2020). */
export const SKY_TRANSMITTANCE_SIZE = [256, 64] as const;
export const SKY_MULTISCATTER_SIZE = [32, 32] as const;
export const SKY_VIEW_SIZE = [192, 108] as const;
/** Tabela da perspectiva aérea (spec 041, R10): colunas na tela × fatias de distância. */
export const SKY_AERIAL_SIZE = [32, 32, 32] as const;
export { SKY_AERIAL_RANGE_KM } from './SkySchema';

/** Raio angular do sol visto da Terra (rad). */
const SUN_ANGULAR_RADIUS = 0.004675;

/** Valores de um `Sky`. */
export interface SkyValues {
    /** A luz direcional que faz o papel de sol: a direção e a iluminância (lux, fora da atmosfera) vêm dela. */
    readonly sun: DirectionalLight;
    /** Turbidez: multiplica os aerossóis (Mie). 1 = céu limpo. Default 1. */
    readonly turbidity?: number;
    /** Altitude do observador acima do chão (km). Default 0,2. */
    readonly altitude?: number;
    /** Albedo do chão do planeta (para o múltiplo espalhamento). Default 0,3. */
    readonly groundAlbedo?: readonly number[];
    /** Piso de radiância noturna (nits, RGB) — o céu nunca fica abaixo dele. Default `[0.0005, 0.0008, 0.0015]`. */
    readonly night?: readonly number[];
    /** Desenha o disco do sol no fundo. Default `true`. */
    readonly sunDisk?: boolean;
}

/** Dado de um `Sky` (layout de `Sky.schema`). */
export interface SkyData {
    sunDirection: number[];
    sunIlluminance: number[];
    rayleigh: number[];
    mie: number[];
    ozone: number[];
    radii: number[];
    ground: number[];
    night: number[];
    sunSlot: number;
    sunDisk: number;
    /** 1 com uma `CloudLayer` na cena: o ambiente dos raios lê `sky_cover` (spec 041). */
    cover: number;
    /** Slot da câmera ativa (a tabela da perspectiva aérea). */
    cameraSlot: number;
    /**
     * 1 quando o céu ilumina as superfícies (sem iluminação global na cena: a luz do céu no lugar do hemisfério, spec
     * 041); fora do uniforme, escrito só quando muda.
     */
    ambient?: number;
    /**
     * 1 quando a tabela da perspectiva aérea da câmera ativa foi escrita: a atmosfera entra em `scene_fog` (spec 041);
     * fora do uniforme, escrito só quando muda.
     */
    aerial?: number;
    /**
     * 1 quando algo além da atmosfera tapa o sol no ar (a sombra de uma `CloudLayer`, spec 041): a tabela aérea integra a
     * visibilidade do sol e o déficit dela no fundo; sem isso, nem a tabela nem o fundo pagam por uma sombra que não há.
     * Fora do uniforme, escrito só quando muda.
     */
    shadowed?: number;
}

/** Espalhamento e extinção de Mie ao nível do chão (1/km) com turbidez 1. */
const MIE_SCATTERING = 3.996e-3;
const MIE_EXTINCTION = 4.44e-3;

/**
 * Céu físico (Camada 3, spec 033, R4): a atmosfera de Hillaire (2020) — Rayleigh, Mie e ozônio, com o múltiplo
 * espalhamento por tabela — calculada pela posição do sol. O sol é uma `DirectionalLight` da cena: a direção e a
 * iluminância vêm dela a cada quadro (o céu acompanha no mesmo quadro, sem recompilar), e a luz dele chega às
 * superfícies atenuada pela atmosfera (contribuição a `light_transmission`). O céu é o fundo visível (contribuição a
 * `scene_background`) e a fonte dos raios que escapam da iluminação global (`sky_radiance`). As tabelas
 * (`rgba16float`) são geradas na GPU pelo `SkyFlow`: transmitância e múltiplo espalhamento quando a atmosfera muda, a
 * vista do céu a cada quadro. Com câmera, também a perspectiva aérea (spec 041): toda a geometria da cena recebe a
 * atmosfera entre a câmera e ela pelo ponto `scene_fog` (atrás da névoa dos volumes), no desenho de cada superfície. Sem `Sky`, a cena fica como na 011 (o
 * hemisfério e o fundo de limpeza).
 */
export class Sky extends Entity<SkyData> implements Resource {
    /** Parâmetros do céu (uniform). */
    static readonly schema = SkySchema;

    state: ResourceState = ResourceState.Uninitialized;

    /** A luz que faz o papel de sol. */
    readonly sun: DirectionalLight;

    constructor(values: SkyValues) {
        super();
        this.sun = values.sun;
        const turbidity = values.turbidity ?? 1;
        const ground = values.groundAlbedo ?? [0.3, 0.3, 0.3];
        this.data = {
            sunDirection: [0, 1, 0, 0],
            sunIlluminance: [0, 0, 0, SUN_ANGULAR_RADIUS],
            rayleigh: [5.802e-3, 13.558e-3, 33.1e-3, 8],
            mie: [MIE_SCATTERING * turbidity, MIE_EXTINCTION * turbidity, 1.2, 0.8],
            ozone: [0.65e-3, 1.881e-3, 0.085e-3, 25],
            radii: [6360, 6460, 15, values.altitude ?? 0.2],
            ground: [ground[0] ?? 0.3, ground[1] ?? 0.3, ground[2] ?? 0.3, 0],
            night: [...(values.night ?? [0.0005, 0.0008, 0.0015]), 0],
            sunSlot: NONE.value,
            sunDisk: values.sunDisk === false ? 0 : 1,
            cover: 0,
            cameraSlot: 0,
            ambient: 0,
            aerial: 0,
            shadowed: 0,
        };
    }

    /** Turbidez atual (aerossóis em relação ao céu limpo). */
    get turbidity(): number {
        return this.rawData.mie[0]! / MIE_SCATTERING;
    }

    /** Muda a turbidez: as tabelas da atmosfera são regeradas no quadro seguinte. */
    set turbidity(value: number) {
        const mie = this.data.mie;
        this.data.mie = [MIE_SCATTERING * value, MIE_EXTINCTION * value, mie[2]!, mie[3]!];
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const table = (id: string, [width, height]: readonly [number, number]): GPUDescriptor => ({
            id,
            role: 'storage-texture',
            textureShape: { format: 'rgba16float', width, height, access: 'write-only' },
        });
        return [
            { id: 'params', role: 'uniform', schema: Sky.schema },
            table('transmittance', SKY_TRANSMITTANCE_SIZE),
            table('multiscatter', SKY_MULTISCATTER_SIZE),
            table('view', SKY_VIEW_SIZE),
            // A perspectiva aérea (spec 041, R10): a luz espalhada e a transmitância da câmera até cada fatia, para toda a
            // geometria da cena; alocada quando o estágio do céu a pede (com câmera).
            // A luz do céu nas superfícies (spec 041): o céu e o chão médios, sem iluminação global.
            {
                id: 'ambient',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: { format: 'rgba16float', width: 2, height: 1, access: 'write-only' },
            },
            ...(['aerial', 'aerialTransmittance'] as const).map(
                (id): GPUDescriptor => ({
                    id,
                    role: 'storage-texture',
                    allocation: 'onDemand',
                    textureShape: {
                        format: 'rgba16float',
                        dimension: '3d',
                        width: SKY_AERIAL_SIZE[0],
                        height: SKY_AERIAL_SIZE[1],
                        depthOrArrayLayers: SKY_AERIAL_SIZE[2],
                        access: 'write-only',
                    },
                }),
            ),
            // O déficit da sombra no fundo (spec 041, raios crepusculares): por coluna da tabela, a luz simples que o ar
            // sombreado deixa de espalhar até o fim da atmosfera; quem desenha o fundo o tira do céu.
            {
                id: 'aerialShadow',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: {
                    format: 'rgba16float',
                    width: SKY_AERIAL_SIZE[0],
                    height: SKY_AERIAL_SIZE[1],
                    access: 'write-only',
                },
            },
            // A direção para o sol de cada quadro (xyz; spec 041), série temporal da 037: quem guarda entre quadros o que
            // o disco do sol mostrava (a resolução temporal, pela máscara reativa) lê onde ele estava no quadro anterior.
            {
                id: 'sunTrack',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: { format: 'rgba32float', width: 1, height: 1, access: 'write-only' },
                history: { depth: 2 },
            },
            // A fração do disco do sol que se vê da câmera (spec 041), série temporal da 037: a média no disco (o que
            // está na frente dele, as nuvens) acumulada como a cor na resolução temporal — o excesso de energia do disco
            // no espalhamento da lente não acompanha o deslocamento da amostra nem o ruído da marcha das nuvens.
            {
                id: 'sunVisibility',
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: { format: 'rgba32float', width: 1, height: 1, access: 'write-only' },
                history: { depth: 2 },
            },
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

    /**
     * Liga ou desliga a leitura do que cobre o céu (`sky_cover`, spec 041) no ambiente dos raios: escrito só quando muda
     * (a composição dos pontos de cena é refeita).
     */
    setCovered(on: boolean): void {
        const cover = on ? 1 : 0;
        if (this.rawData.cover !== cover) this.data.cover = cover;
    }

    /**
     * Liga ou desliga a luz do céu nas superfícies (sem iluminação global: os estágios padrão trocam o hemisfério por
     * ela; com a GI, as sondas são a luz que volta do céu). Escrito só quando muda.
     */
    setAmbient(on: boolean): void {
        const ambient = on ? 1 : 0;
        if ((this.rawData.ambient ?? 0) !== ambient) this.data.ambient = ambient;
    }

    /**
     * Liga ou desliga a perspectiva aérea na geometria (`scene_fog`): ligada quando a tabela da câmera ativa foi
     * escrita no quadro (o `SkyFlow`), desligada sem câmera. Escrito só quando muda.
     */
    setAerial(on: boolean): void {
        const aerial = on ? 1 : 0;
        if ((this.rawData.aerial ?? 0) !== aerial) this.data.aerial = aerial;
    }

    /**
     * Liga ou desliga a sombra do que tapa o sol no ar (spec 041: a camada de nuvens, pelo `light_transmission`): a
     * visibilidade do sol na tabela aérea e o déficit dela no fundo. Escrito só quando muda.
     */
    setShadowed(on: boolean): void {
        const shadowed = on ? 1 : 0;
        if ((this.rawData.shadowed ?? 0) !== shadowed) this.data.shadowed = shadowed;
    }

    /** Se algo além da atmosfera tapa o sol no ar. */
    get shadowed(): boolean {
        return this.rawData.shadowed === 1;
    }

    /** Se o céu ilumina as superfícies. */
    get lightsSurfaces(): boolean {
        return this.rawData.ambient === 1;
    }

    /** A transmitância do sol em `light_transmission` e o céu como fundo em `scene_background`. */
    getSceneContributions(): readonly SceneContribution[] {
        return this.contributions;
    }

    private readonly contributions = skyContributions(
        () => this.rawData.cover === 1,
        () => this.rawData.ambient === 1,
        () => this.rawData.aerial === 1,
        () => this.rawData.shadowed === 1,
    );
}
