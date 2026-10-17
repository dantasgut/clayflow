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
    _pad0: number;
    _pad1: number;
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
 * vista do céu a cada quadro. Sem `Sky`, a cena fica como na 011 (o hemisfério e o fundo de limpeza).
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
            _pad0: 0,
            _pad1: 0,
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

    /** A transmitância do sol em `light_transmission` e o céu como fundo em `scene_background`. */
    getSceneContributions(): readonly SceneContribution[] {
        return skyContributions;
    }
}
