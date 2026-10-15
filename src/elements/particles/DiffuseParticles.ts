import { Entity } from '../../scene/contracts/Entity';
import type { Resource } from '../../scene/contracts/Resource';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { PointCloudGeometry } from '../geometry/PointCloudGeometry';
import { DiffuseMaterial, type DiffuseMaterialOptions } from '../material/DiffuseMaterial';
import type { FluidBody } from '../physics/bodies/FluidBody';
import { Transform } from '../scene/Transform';
import { DiffuseParticleSchema } from './DiffuseSchemas';

/** Faixa [mínimo, máximo] de um potencial de geração (Φ normaliza para [0, 1] entre eles). */
export type PotentialRange = readonly [number, number];

/** Opções das partículas secundárias de um fluido. */
export interface DiffuseParticlesOptions {
    /** O corpo de fluido de onde nascem (SPH, PBF ou MPM fluido). */
    readonly source: FluidBody;
    /** Capacidade do anel (partículas vivas no máximo). Default 65 536. */
    readonly maxParticles?: number;
    /** Ar aprisionado: Σ |v_ij| (1 − v̂_ij·x̂_ij) W, em m/s. Default [5, 20]. */
    readonly trappedAir?: PotentialRange;
    /** Crista de onda: Σ (1 − n̂_i·n̂_j) W. Default [2, 8]. */
    readonly waveCrest?: PotentialRange;
    /** Energia cinética por massa ½ v², em J/kg. Default [2, 20]. */
    readonly kinetic?: PotentialRange;
    /** Partículas geradas por segundo por partícula de fluido com ar aprisionado pleno. Default 20. */
    readonly trappedAirRate?: number;
    /** Partículas geradas por segundo por partícula de fluido em crista plena. Default 20. */
    readonly waveCrestRate?: number;
    /** Vida da espuma (s; spray e bolha envelhecem `sprayAging` vezes mais devagar). Default 1,5. */
    readonly lifetime?: number;
    /** Envelhecimento relativo do spray e das bolhas (0: não envelhecem). Default 0,25. */
    readonly sprayAging?: number;
    /** Arrasto do ar sobre o spray (1/s). Default 0,4. */
    readonly airDrag?: number;
    /** Empuxo das bolhas em múltiplos de g (para cima). Default 0,8. */
    readonly buoyancy?: number;
    /** Arrasto das bolhas para a velocidade do fluido (fração por passo). Default 0,5. */
    readonly bubbleDrag?: number;
    /** Vizinhos do fluido abaixo dos quais é spray. Default 6. */
    readonly sprayNeighbors?: number;
    /** Vizinhos do fluido acima dos quais é bolha. Default 20. */
    readonly bubbleNeighbors?: number;
    /** Aparência (cores e raios por tipo). */
    readonly appearance?: DiffuseMaterialOptions;
}

/** Dado das partículas secundárias (os parâmetros de geração e de dinâmica). */
export interface DiffuseParticlesData {
    /** Capacidade do anel. */
    maxParticles: number;
    /** Faixas dos potenciais: ar aprisionado, crista, energia cinética. */
    trappedAir: number[];
    waveCrest: number[];
    kinetic: number[];
    /** Ganhos de geração (1/s). */
    trappedAirRate: number;
    waveCrestRate: number;
    /** Dinâmica. */
    lifetime: number;
    sprayAging: number;
    airDrag: number;
    buoyancy: number;
    bubbleDrag: number;
    /** Limiares de vizinhança da classificação. */
    sprayNeighbors: number;
    bubbleNeighbors: number;
}

function range(name: string, r: PotentialRange): number[] {
    if (!(r[0] >= 0 && r[1] > r[0]))
        throw new RangeError(`DiffuseParticles: faixa ${name} [${r[0]}, ${r[1]}] inválida.`);
    return [r[0], r[1]];
}

function nonNegative(name: string, v: number): number {
    if (!(v >= 0) || !Number.isFinite(v))
        throw new RangeError(`DiffuseParticles: ${name} deve ser ≥ 0 (recebeu ${v}).`);
    return v;
}

/**
 * Partículas secundárias de um fluido de partículas (spec 010; Ihmsen et al. 2012, "Unified Spray, Foam and Bubbles
 * for Particle-Based Fluids"): onde o fluido aprisiona ar, forma cristas e tem energia, nascem partículas leves que a
 * vizinhança do fluido classifica — **spray** (fora da água: balística com arrasto do ar; o que bate num sólido se
 * desfaz), **espuma** (na superfície: levada pelo fluido, se dissolve) e **bolhas** (dentro: empuxo e arrasto para o
 * fluido). O detalhe do respingo menor que o espaçamento das partículas do fluido. Tudo na GPU (`DiffuseFlow`),
 * determinístico; desenhadas pela nuvem de pontos e pelo `DiffuseMaterial` que a entidade já traz.
 *
 *     app.world.insert(new DiffuseParticles({ source: agua }));
 */
export class DiffuseParticles extends Entity<DiffuseParticlesData> implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    /** O corpo de fluido de origem. */
    readonly source: FluidBody;

    constructor(options: DiffuseParticlesOptions) {
        super();
        const max = options.maxParticles ?? 65_536;
        if (!Number.isInteger(max) || max < 1 || max > 4_194_304)
            throw new RangeError(`DiffuseParticles: maxParticles ${max} fora de [1, 4 194 304].`);
        this.source = options.source;
        this.data = {
            maxParticles: max,
            trappedAir: range('trappedAir', options.trappedAir ?? [5, 20]),
            waveCrest: range('waveCrest', options.waveCrest ?? [2, 8]),
            kinetic: range('kinetic', options.kinetic ?? [2, 20]),
            trappedAirRate: nonNegative('trappedAirRate', options.trappedAirRate ?? 20),
            waveCrestRate: nonNegative('waveCrestRate', options.waveCrestRate ?? 20),
            lifetime: nonNegative('lifetime', options.lifetime ?? 1.5),
            sprayAging: nonNegative('sprayAging', options.sprayAging ?? 0.25),
            airDrag: nonNegative('airDrag', options.airDrag ?? 0.4),
            buoyancy: nonNegative('buoyancy', options.buoyancy ?? 0.8),
            bubbleDrag: nonNegative('bubbleDrag', options.bubbleDrag ?? 0.5),
            sprayNeighbors: nonNegative('sprayNeighbors', options.sprayNeighbors ?? 6),
            bubbleNeighbors: nonNegative('bubbleNeighbors', options.bubbleNeighbors ?? 20),
        };
        this.add(new PointCloudGeometry({ maxPoints: max }));
        this.add(new DiffuseMaterial(options.appearance));
        this.add(new Transform());
    }

    /** Partículas (posição e tipo; velocidade e vida), escritas só pela GPU — começam zeradas, nenhuma viva. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'particles',
                role: 'storage-rw',
                schema: DiffuseParticleSchema,
                count: this.data.maxParticles,
                upload: 'never',
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
