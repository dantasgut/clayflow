import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import {
    rayVolumeSurfacePoint,
    rayVolumeHitPoint,
    rayVolumeTransmittancePoint,
} from '../raytrace/points';
import { fieldRayHit, fieldRaySurface, fieldRayTransmittance, fieldWetness } from './shaders';
import { sceneWetnessPoint } from '../scene/points/media';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { SetCountSchema } from '../../scene/graph/SetCountSchema';
import {
    FIELD_BRICK_APRON_VOXELS,
    FIELD_FILM_CELLS,
    FIELD_FILM_WORDS,
    FieldWordSchema,
    FluidFieldSchema,
} from './schemas';

/** Capacidades do campo: blocos e baldes da tabela (potências de dois). */
export interface FluidFieldCapacity {
    readonly bricks: number;
    readonly table: number;
}

/** Dado de um `FluidField`: as capacidades, o uniform (escrito pelo estágio quando muda) e se há fluido na cena. */
export interface FluidFieldData extends FluidFieldCapacity {
    params: [Record<string, number[] | number[][]>];
    /** 1 com corpos de fluido na cena (o campo contribui para os raios); 0 sem. Escrito só quando muda. */
    volume: number;
}

/** Palavras do cabeçalho do buffer das consultas (os limites). */
export const FIELD_HEADER_WORDS = 8;

/** Deslocamentos (em palavras) da tabela, dos blocos e dos voxels no buffer das consultas. */
export function fieldDataLayout(c: FluidFieldCapacity): {
    table: number;
    bricks: number;
    voxels: number;
} {
    const table = FIELD_HEADER_WORDS;
    // Depois da tabela dos blocos, a dos superblocos (¼ dela, uma palavra por balde).
    const bricks = table + 2 * c.table + c.table / 4;
    return { table, bricks, voxels: bricks + 4 * c.bricks };
}

/** Primeira palavra da película de água nos sólidos (spec 034), depois dos voxels com a borda. */
export function fieldFilmOffset(c: FluidFieldCapacity): number {
    return fieldDataLayout(c).voxels + c.bricks * FIELD_BRICK_APRON_VOXELS;
}

/** Palavras do buffer das consultas para as capacidades `c` (com a película: `FIELD_FILM_WORDS` por célula). */
function fieldDataWords(c: FluidFieldCapacity): number {
    return fieldFilmOffset(c) + FIELD_FILM_WORDS.value * FIELD_FILM_CELLS;
}

function grow(current: number, needed: number): number {
    let c = Math.max(1, current);
    while (c < needed) c *= 2;
    return c;
}

/**
 * Campo dos fluidos (Camada 3, spec 033, R11): a superfície contínua dos corpos de fluido (`isFieldBody`: o `FluidBody`
 * com a função `material` — a aparência pelo grafo, spec 034 T065d) como distância com sinal no espaço, construída na GPU a cada quadro pelo `FluidFieldFlow` (sem
 * mudança de autoria: o material na entidade basta). Grade esparsa em blocos de 8³ voxels de ½ espaçamento de partícula, só onde há
 * partículas, por núcleos anisotrópicos e redistanciamento — superfícies planas ficam planas, gotas separadas não se
 * fundem, a normal é contínua. O que quem consulta lê (`fields`: os limites, a tabela dos blocos, os blocos e os voxels
 * com a borda) fica num buffer só (`data`, uma ligação de storage: cabe ao lado dos da luz rebatida), mais a contagem:
 * a câmera, a luz, os raios das sondas e a luz rebatida enxergam a mesma superfície. Um por cena, inserido pelos estágios padrão; as capacidades crescem com as partículas (`reserve`).
 */
export class FluidField extends Entity<FluidFieldData> implements Resource {
    /** Parâmetros (uniform). */
    static readonly schema = FluidFieldSchema;

    state: ResourceState = ResourceState.Uninitialized;

    constructor() {
        super();
        this.data = {
            bricks: 64,
            table: 256,
            params: [FluidFieldSchema.applyDefaults({}) as Record<string, number[] | number[][]>],
            volume: 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'params', role: 'uniform', schema: FluidField.schema },
            {
                id: 'data',
                role: 'storage-rw',
                schema: FieldWordSchema,
                count: fieldDataWords(this.rawData),
                upload: 'never',
            },
            { id: 'counts', role: 'indirect', schema: SetCountSchema, count: 1, upload: 'never' },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /**
     * Os raios atravessam o fluido (spec 033): o cruzamento com a superfície (`ray_volume_hit`), o material nele
     * (`ray_volume_surface`, spec 034 T065d) e a absorção pelos trechos dentro dele (`ray_volume_transmittance`) — só
     * com fluido na cena (`volume` = 1). Os três com a mesma ordem: o `source` do acerto é a posição no ponto. E a
     * película de água que o fluido deixa nos sólidos (`scene_wetness`, spec 034), que quem sombreia uma superfície lê.
     */
    getSceneContributions(): readonly SceneContribution[] {
        return this.contributions;
    }

    /** O campo contribui para os raios (há corpos de fluido com partículas na cena)? */
    get volume(): boolean {
        return this.rawData.volume === 1;
    }

    /** Liga ou desliga a contribuição aos raios (estado `volume`, escrito só quando muda). */
    setVolume(on: boolean): void {
        const volume = on ? 1 : 0;
        if (this.rawData.volume !== volume) this.data.volume = volume;
    }

    private readonly contributions: readonly SceneContribution[] = [
        {
            point: rayVolumeHitPoint,
            order: 0,
            pools: [],
            build: () => (this.rawData.volume === 1 ? fieldRayHit : undefined),
        },
        {
            point: rayVolumeSurfacePoint,
            order: 0,
            pools: [],
            build: () => (this.rawData.volume === 1 ? fieldRaySurface : undefined),
        },
        {
            point: rayVolumeTransmittancePoint,
            order: 0,
            pools: [],
            build: () => (this.rawData.volume === 1 ? fieldRayTransmittance : undefined),
        },
        {
            point: sceneWetnessPoint,
            order: 0,
            pools: [],
            build: () => (this.rawData.volume === 1 ? fieldWetness : undefined),
        },
    ];

    /** Capacidades atuais (blocos e baldes da tabela). */
    get capacity(): FluidFieldCapacity {
        return { bricks: this.rawData.bricks, table: this.rawData.table };
    }

    /** Garante as capacidades pedidas (potências de dois); devolve `true` quando alguma cresceu (buffers realocados). */
    reserve(needed: FluidFieldCapacity): boolean {
        const current = this.rawData;
        const next = {
            bricks: grow(current.bricks, needed.bricks),
            table: grow(current.table, needed.table),
        };
        if (next.bricks === current.bricks && next.table === current.table) return false;
        this.redescribe(this.getDescriptors(), { ...current, ...next });
        return true;
    }
}
