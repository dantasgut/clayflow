import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { WaterLightMatrixSchema } from '../../elements/material/forwardSchemas';

/** Opções da superfície de água da cena. */
export interface WaterSurfaceOptions {
    /** Resolução (largura = altura) da superfície vista pela luz e do mapa de cáusticas. Padrão 512. */
    readonly lightSize?: number;
}

/** Um acumulador de fótons das cáusticas (ponto fixo, somado por `atomicAdd`). */
const PhotonSchema = new StructSchema('WaterPhoton', { value: FieldType.u32 });

/** Valor de profundidade linear que marca "sem água" nas texturas de profundidade da superfície. */
export const NO_WATER_DEPTH = 1e9;

/**
 * Superfície de água da cena (Camada 4, spec 017): as texturas que os estágios da água compartilham — a superfície
 * genérica (profundidade linear suavizada, espessura e material por pixel) nas vistas da câmera e da luz, a cópia da
 * cena antes da água (fonte da refração), o enquadramento da vista da luz (matriz ajustada à água, produzida na GPU),
 * o mapa de cáusticas e os acumuladores de fótons.
 *
 * Quem produz a superfície (hoje o `FluidSurfaceFlow`, a partir das partículas; depois a água por altura da spec 029)
 * escreve `depth`/`thickness`/`material` e `lightDepth`/`lightMaterial`; quem consome (`CausticsFlow`, `WaterFlow`) não
 * sabe a origem. Todos os descritores são alocados sob demanda (`allocation: 'onDemand'`): o produtor pede a alocação
 * quando a primeira água entra; sem água, nada ocupa memória. As texturas da vista da câmera têm o tamanho do canvas e
 * são recriadas pela C2 com ele. Uma por cena, inserida pelos estágios padrão.
 */
export class WaterSurface extends Entity<Record<string, never>> implements Resource {
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
    }

    /** Vistas com superfície produzida no quadro corrente (marcadas pelos produtores em `framePrepare`). */
    private readonly produced = { camera: false, light: false };

    /**
     * Um produtor declara se escreveu a superfície da `view` neste quadro (em `framePrepare`, antes da gravação). Os
     * consumidores (`WaterFlow`, `CausticsFlow`, o forward) só gravam com a vista produzida.
     */
    markProduced(view: 'camera' | 'light', produced: boolean): void {
        this.produced[view] = produced;
    }

    /** A superfície da `view` foi produzida neste quadro? */
    isProduced(view: 'camera' | 'light'): boolean {
        return this.produced[view];
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const view = (
            id: string,
            role: 'texture' | 'storage-texture',
            format: GPUTextureFormat | 'canvas',
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
            // Vista da câmera.
            view('depthRaw', 'texture', 'r32float'),
            view('depthTemp', 'storage-texture', 'r32float'),
            view('depth', 'storage-texture', 'r32float'),
            view('thicknessRaw', 'texture', 'r16float'),
            view('thicknessTemp', 'storage-texture', 'r32float'),
            view('thickness', 'storage-texture', 'r32float'),
            view('material', 'texture', 'r32uint'),
            view('depthStencil', 'texture', 'depth32float'),
            view('background', 'texture', 'canvas'),
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
