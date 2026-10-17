import { WATER_NO_DEPTH } from '../water/constants';
import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import { lightTransmissionPoint } from '../../elements/scene/points/lighting';
import { WaterLightMatrixSchema, WaterStateSchema } from '../water/schemas';
import { waterTransmission } from '../water/shaders';
import { SCENE_COLOR_FORMAT } from './FrameTargets';

/** Opções da superfície de água da cena. */
export interface WaterSurfaceOptions {
    /** Resolução (largura = altura) da superfície vista pela luz e do mapa de cáusticas. Padrão 512. */
    readonly lightSize?: number;
}

/** Um acumulador de fótons das cáusticas (ponto fixo, somado por `atomicAdd`). */
const PhotonSchema = new StructSchema('WaterPhoton', { value: FieldType.u32 });

/** Valor de profundidade linear que marca "sem água" nas texturas de profundidade da superfície. */
export const NO_WATER_DEPTH = WATER_NO_DEPTH.value;

/** Dado do `WaterSurface` (layout de `WaterStateSchema`, descritor `state`). */
export interface WaterSurfaceData {
    /** 1 com a superfície vista pela luz produzida no quadro (cáusticas na luz direta); 0 sem. */
    caustics: number;
    /** Preenchimento do layout. */
    _pad0: number;
    /** Preenchimento do layout. */
    _pad1: number;
    /** Preenchimento do layout. */
    _pad2: number;
}

/**
 * Superfície de água da cena (Camada 4, spec 017): as texturas que os estágios da água compartilham — a superfície
 * genérica (profundidade linear suavizada, espessura e material por pixel) nas vistas da câmera e da luz, a cópia da
 * cena antes da água (fonte da refração), o enquadramento da vista da luz (matriz ajustada à água, produzida na GPU),
 * o mapa de cáusticas e os acumuladores de fótons.
 *
 * Quem produz a superfície (hoje o `FluidSurfaceFlow`, a partir das partículas; depois a água por altura da spec 029)
 * escreve `depth`/`thickness`/`material` e `lightDepth`/`lightMaterial`; quem consome (`CausticsFlow`, `WaterFlow`) não
 * sabe a origem. Os descritores dos estágios da água são alocados sob demanda (`allocation: 'onDemand'`): o produtor
 * pede a alocação quando a primeira água entra. As texturas da vista da câmera têm o tamanho do canvas e são recriadas
 * pela C2 com ele. Uma por cena, inserida pelos estágios padrão.
 *
 * A água contribui para a luz da cena sem que os desenhos a conheçam (spec 031): `getSceneContributions` põe no ponto
 * `light_transmission` a transmissão pelas cáusticas enquanto elas estão ligadas (`caustics` = 1 com a vista da luz
 * produzida, escrito só quando muda; a C2 recompõe os desenhos ao receber o envio). Sem cáusticas a água não contribui
 * e nada da vista da luz é alocado; o estado `state` (16 B) fica com a água para os desenhos já compostos com ela.
 */
export class WaterSurface extends Entity<WaterSurfaceData> implements Resource {
    /** Identidade da superfície na cena (o World indexa pelo schema da classe); sem dados de GPU próprios. */
    static readonly schema = new StructSchema('WaterSurface', { _unused: FieldType.u32 });

    state: ResourceState = ResourceState.Uninitialized;
    /** Resolução da vista da luz e das cáusticas. */
    readonly lightSize: number;

    constructor(options: WaterSurfaceOptions = {}) {
        super();
        const lightSize = options.lightSize ?? 512;
        if (!Number.isInteger(lightSize) || lightSize < 16 || lightSize > 4096) {
            throw new Error(
                `WaterSurface: lightSize deve ser inteiro em [16, 4096] (recebeu ${lightSize})`,
            );
        }
        this.lightSize = lightSize;
        this.data = { caustics: 0, _pad0: 0, _pad1: 0, _pad2: 0 };
    }

    /**
     * Descritor que marca a superfície de cada vista como produzida no quadro (spec 031, R5: estado genérico da C2,
     * `TransitionContext.produced` pelo produtor e `ResourceDirectory.isProduced` pelos consumidores).
     */
    static readonly producedDescriptor = { camera: 'depth', light: 'lightDepth' } as const;

    /** Liga ou desliga as cáusticas na transmissão da luz (estado `caustics`, escrito só quando muda). */
    setCaustics(on: boolean): void {
        const caustics = on ? 1 : 0;
        if (this.rawData.caustics !== caustics) this.data.caustics = caustics;
    }

    /** A transmissão da luz pela água (cáusticas) no ponto de cena `light_transmission` — sempre, sem slots. */
    getSceneContributions(): readonly SceneContribution[] {
        return this.contributions;
    }

    /** Transmissão pelas cáusticas, só com elas ligadas (o estado é enviado quando muda). */
    private readonly contributions: readonly SceneContribution[] = [
        {
            point: lightTransmissionPoint,
            order: 0,
            pools: [],
            build: () => (this.rawData.caustics === 1 ? waterTransmission : undefined),
        },
    ];

    getDescriptors(): readonly GPUDescriptor[] {
        const view = (
            id: string,
            role: 'texture' | 'storage-texture',
            format: GPUTextureFormat,
        ): GPUDescriptor => ({
            id,
            role,
            allocation: 'onDemand',
            textureShape: {
                format,
                sizeFromCanvas: true,
                ...(role === 'storage-texture' ? { access: 'write-only' as const } : {}),
            },
        });
        const size = this.lightSize;
        const light = (
            id: string,
            role: 'texture' | 'storage-texture',
            format: GPUTextureFormat,
        ): GPUDescriptor => ({
            id,
            role,
            allocation: 'onDemand',
            textureShape: {
                format,
                width: size,
                height: size,
                ...(role === 'storage-texture' ? { access: 'write-only' as const } : {}),
            },
        });
        return [
            // Estado lido pelos desenhos (contribuição à transmissão da luz).
            { id: 'state', role: 'uniform', schema: WaterStateSchema },
            // Vista da câmera.
            view('depthRaw', 'texture', 'r32float'),
            view('depthTemp', 'storage-texture', 'r32float'),
            view('depth', 'storage-texture', 'r32float'),
            view('thicknessRaw', 'texture', 'r16float'),
            view('thicknessTemp', 'storage-texture', 'r32float'),
            view('thickness', 'storage-texture', 'r32float'),
            view('material', 'texture', 'r32uint'),
            view('depthStencil', 'texture', 'depth32float'),
            view('background', 'texture', SCENE_COLOR_FORMAT),
            // Vista da luz e cáusticas.
            light('lightDepthRaw', 'texture', 'r32float'),
            light('lightDepthTemp', 'storage-texture', 'r32float'),
            light('lightDepth', 'storage-texture', 'r32float'),
            light('lightMaterial', 'texture', 'r32uint'),
            light('lightDepthStencil', 'texture', 'depth32float'),
            light('caustics', 'storage-texture', 'rgba16float'),
            {
                id: 'lightMatrix',
                role: 'storage-rw',
                allocation: 'onDemand',
                schema: WaterLightMatrixSchema,
                upload: 'never',
            },
            {
                id: 'lightBounds',
                role: 'storage-rw',
                allocation: 'onDemand',
                schema: PhotonSchema,
                count: 8,
                upload: 'never',
            },
            {
                id: 'photons',
                role: 'storage-rw',
                allocation: 'onDemand',
                schema: PhotonSchema,
                count: 3 * size * size,
                upload: 'never',
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}

/** Descritores da vista da câmera (alocados juntos pelo produtor). */
export const WATER_VIEW_TEXTURES = [
    'depthRaw',
    'depthTemp',
    'depth',
    'thicknessRaw',
    'thicknessTemp',
    'thickness',
    'material',
    'depthStencil',
    'background',
] as const;

/** Descritores da vista da luz e das cáusticas (alocados juntos pelo produtor da luz). */
export const WATER_LIGHT_TEXTURES = [
    'lightDepthRaw',
    'lightDepthTemp',
    'lightDepth',
    'lightMaterial',
    'lightDepthStencil',
    'caustics',
    'lightMatrix',
    'lightBounds',
    'photons',
] as const;
