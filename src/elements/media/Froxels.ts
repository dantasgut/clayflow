import { Entity } from '../../scene/contracts/Entity';
import type { CompositeFunction } from '../../scene/contracts/ExtensionFunction';
import type { Resource } from '../../scene/contracts/Resource';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { bindPoints } from '../../scene/shaders/bindPoints';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import { rayVolumeTransmittancePoint } from '../raytrace/points';
import { lightTransmissionPoint } from '../scene/points/lighting';
import { sceneFogPoint } from '../scene/points/media';
import type { HistoryPrecision } from '../scene/TemporalAntialiasing';
import { FROXEL_AMBIENT_GRID, FROXEL_GRID, FroxelsSchema } from './schemas';
import { composeDensityFunctions } from './composeDensity';
import {
    fogDensityAtPoint,
    mediaLightTransmission,
    mediaLookup,
    mediaRayTransmittance,
    mediaVolumes,
    mediaVolumesPoint,
} from './shaders';

/** vec4f do buffer dos meios (o tamanho do descritor). */
export const FogMediaWordSchema = new StructSchema('FogMediaWord', { value: FieldType.vec4f });

/** Dado dos `Froxels`: o uniform (escrito pelo estágio), a capacidade do buffer dos meios e se há névoa na cena. */
export interface FroxelsData {
    params: [Record<string, number[]>];
    /** vec4f do buffer dos meios (cabeçalho, registros e grades). */
    capacity: number;
    /** 1 com algum `FogVolume` na cena (as contribuições valem); 0 sem. Escrito só quando muda. */
    active: number;
    /** Revisão da composição das funções de densidade (sobe a cada mudança do conjunto). */
    revision: number;
    /** Precisão dos históricos da névoa (spec 037, R6): 0 half, 1 full. */
    historyPrecision: number;
}

function grow(current: number, needed: number): number {
    let c = Math.max(1, current);
    while (c < needed) c *= 2;
    return c;
}

/**
 * Froxels dos meios participantes (Camada 3, spec 033, R12): a grade 160 × 90 × 128 alinhada à câmera (fatias
 * exponenciais da profundidade) onde o `FroxelFlow` injeta, acumula no tempo e integra a névoa de todos os `FogVolume`
 * da cena, e o buffer dos meios (os volumes e as grades de densidade, uma ligação só). Contribui aos pontos de cena: a
 * névoa no desenho (`scene_fog`), a transmitância nos raios (`ray_volume_transmittance`: sondas, fótons) e na luz que
 * chega aos pontos (`light_transmission`: as superfícies dentro da névoa, a própria névoa) — só com névoa. Um por cena,
 * inserido pelos estágios padrão.
 */
export class Froxels extends Entity<FroxelsData> implements Resource {
    /** Parâmetros (uniform). */
    static readonly schema = FroxelsSchema;

    state: ResourceState = ResourceState.Uninitialized;
    /** As funções de densidade dos volumes, na ordem dos índices gravados neles (índice k + 1 → `functions[k]`). */
    densityFunctions: readonly CompositeFunction[] = [];

    constructor() {
        super();
        this.data = {
            params: [FroxelsSchema.applyDefaults({}) as Record<string, number[]>],
            capacity: 64,
            active: 0,
            revision: 0,
            historyPrecision: 0,
        };
    }

    /**
     * Precisão do histórico da névoa (`half`, o padrão, ou `full`: 32 bits, dobra a banda das duas fatias). `full`
     * exige `float32-filterable` (o histórico é lido filtrado); sem ela, a C2 o mantém em `half` com aviso (spec 037:
     * a precisão de um canal temporal). Mudar realoca o histórico (recomeça).
     */
    get historyPrecision(): HistoryPrecision {
        return this.data.historyPrecision === 1 ? 'full' : 'half';
    }

    set historyPrecision(precision: HistoryPrecision) {
        const value = precision === 'full' ? 1 : 0;
        if (value === this.rawData.historyPrecision) return;
        this.redescribe(this.getDescriptors(), { ...this.rawData, historyPrecision: value });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const volume = (
            id: string,
            grid: readonly [number, number, number] = FROXEL_GRID,
            format: GPUTextureFormat = 'rgba16float',
        ): GPUDescriptor => ({
            id,
            role: 'storage-texture',
            // Só com névoa na cena (o `FroxelFlow` pede): sem ela, as ~45 MB das grades não existem.
            allocation: 'onDemand',
            textureShape: {
                format,
                dimension: '3d',
                width: grid[0],
                height: grid[1],
                depthOrArrayLayers: grid[2],
                access: 'write-only',
            },
        });
        return [
            { id: 'params', role: 'uniform', schema: Froxels.schema },
            {
                id: 'media',
                role: 'storage-rw',
                schema: FogMediaWordSchema,
                count: this.rawData.capacity,
                upload: 'never',
            },
            volume('scatter'),
            // O histórico: um canal temporal da C2 (spec 037) — a fatia do quadro anterior, lida filtrada na injeção,
            // e a do quadro, escrita por ela e lida na integração.
            {
                ...volume('history'),
                history: { depth: 2, precision: this.historyPrecision, filtered: true },
            },
            // A luz ambiente (o hemisfério, a luz rebatida) numa grade mais grossa, lida na injeção.
            volume('ambient', FROXEL_AMBIENT_GRID),
            {
                id: 'sampler',
                role: 'sampler',
                samplerShape: {
                    magFilter: 'linear',
                    minFilter: 'linear',
                    addressModeU: 'clamp-to-edge',
                    addressModeV: 'clamp-to-edge',
                    addressModeW: 'clamp-to-edge',
                },
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    getSceneContributions(): readonly SceneContribution[] {
        return this.contributions;
    }

    /** Liga ou desliga as contribuições (estado `active`, escrito só quando muda). */
    setActive(on: boolean): void {
        const active = on ? 1 : 0;
        if (this.rawData.active !== active) this.data.active = active;
    }

    /** Troca as funções de densidade (a composição muda: as contribuições e os kernels são refeitos). */
    setDensityFunctions(functions: readonly CompositeFunction[]): void {
        this.densityFunctions = functions;
        this.composed.clear();
        this.volumes = undefined;
        this.data.revision = this.rawData.revision + 1;
    }

    /** Garante `words` vec4f no buffer dos meios (potências de dois); `true` quando cresceu (buffer realocado). */
    reserve(words: number): boolean {
        const capacity = grow(this.rawData.capacity, words);
        if (capacity === this.rawData.capacity) return false;
        this.redescribe(this.getDescriptors(), { ...this.rawData, capacity });
        return true;
    }

    /**
     * O módulo com as funções de densidade da cena no lugar da pronta (memorizado por revisão): os volumes compostos uma
     * vez (`media_volumes` com o `switch`) e trocados em cada módulo que os usa — o mesmo objeto no kernel e nas
     * contribuições que entram nele.
     */
    withDensity(module: WgslModule): WgslModule {
        if (this.densityFunctions.length === 0) return module;
        let m = this.composed.get(module);
        if (m === undefined) {
            this.volumes ??= bindPoints(
                mediaVolumes,
                new Map([[fogDensityAtPoint, composeDensityFunctions(this.densityFunctions)]]),
            );
            m = bindPoints(module, new Map([[mediaVolumesPoint, this.volumes]]));
            this.composed.set(module, m);
        }
        return m;
    }

    /** Os volumes com as funções de densidade da revisão atual. */
    private volumes: WgslModule | undefined;
    private readonly composed = new Map<WgslModule, WgslModule>();

    private readonly contributions: readonly SceneContribution[] = [
        {
            point: sceneFogPoint,
            order: 0,
            pools: [],
            build: () => (this.rawData.active === 1 ? mediaLookup : undefined),
        },
        {
            point: rayVolumeTransmittancePoint,
            order: 10,
            pools: [],
            build: () =>
                this.rawData.active === 1 ? this.withDensity(mediaRayTransmittance) : undefined,
        },
        {
            point: lightTransmissionPoint,
            order: 10,
            pools: [],
            build: () =>
                this.rawData.active === 1 ? this.withDensity(mediaLightTransmission) : undefined,
        },
    ];
}
