import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { World } from '../../../scene/world/World';

/** Opções de domínio do material de partículas (fluidos SPH/PBF/MPM e sólidos MPM). */
export interface ParticleMaterialOptions {
    /** Densidade de repouso em kg/m³ (default 1000, água). */
    readonly restDensity?: number;
    /** Espaçamento entre partículas em repouso, em metros (default 0.05). Define massa, suavização e grade. */
    readonly particleSpacing?: number;
    /** Coeficiente de viscosidade (default 0.01). */
    readonly viscosity?: number;
    /** Velocidade do som numérica em m/s (default 10): rigidez do fluido e passo estável. */
    readonly speedOfSound?: number;
    /** Restituição no contato com colliders e com os limites do domínio (default 0.2). */
    readonly restitution?: number;
    /** Módulo de Young em Pa dos sólidos MPM (default 5e4). */
    readonly youngModulus?: number;
    /** Coeficiente de Poisson dos sólidos MPM, em [0, 0.5) (default 0.3). */
    readonly poissonRatio?: number;
    /** Canto mínimo do domínio simulado, em metros (default [-2, -2, -2]). */
    readonly domainMin?: readonly [number, number, number];
    /** Canto máximo do domínio simulado, em metros (default [2, 2, 2]). */
    readonly domainMax?: readonly [number, number, number];
}

/** Expoente da equação de Tait do SPH fracamente compressível. */
export const TAIT_GAMMA = 7;

/** Constantes de Lamé derivadas do módulo de Young e do coeficiente de Poisson. */
export interface LameParameters {
    /** μ — módulo de cisalhamento. */
    readonly mu: number;
    /** λ — primeiro parâmetro de Lamé. */
    readonly lambda: number;
}

/** Grade uniforme que cobre o domínio das partículas. */
export interface ParticleGrid {
    /** Canto mínimo da grade (mundo). */
    readonly origin: [number, number, number];
    /** Células por eixo. */
    readonly gridDim: [number, number, number];
    /** Aresta da célula (mundo). */
    readonly cellSize: number;
}

function positive(name: string, value: number): number {
    if (!(value > 0) || !Number.isFinite(value)) {
        throw new RangeError(`ParticleMaterial: ${name} deve ser > 0 (recebeu ${value})`);
    }
    return value;
}

/** Dado de um `ParticleMaterial` (layout de `ParticleMaterial.schema`). */
export interface ParticleMaterialData {
    /** Densidade de repouso ρ₀ (kg/m³). */
    restDensity: number;
    /** Espaçamento das partículas (m). */
    particleSpacing: number;
    /** Viscosidade. */
    viscosity: number;
    /** Velocidade do som c (m/s). */
    speedOfSound: number;
    /** Restituição. */
    restitution: number;
    /** Módulo de Young E. */
    youngModulus: number;
    /** Coeficiente de Poisson ν. */
    poissonRatio: number;
    /** Preenchimento do layout. */
    _pad0: number;
    /** Canto mínimo do domínio. */
    domainMin: number[];
    /** Canto máximo do domínio. */
    domainMax: number[];
}

/**
 * ParticleMaterial — material dos corpos de partículas (fluidos SPH, PBF e MPM; sólidos MPM), em vocabulário de
 * domínio. Recurso único por cena, lido pelos estágios de física como o `GravityField`; sem material no World, os
 * estágios usam os padrões (`ParticleMaterial.of(world)`).
 *
 * As grandezas numéricas dos solvers derivam dele: massa da partícula ρ₀s³, raio de suavização do SPH (1,3 s; spline
 * cúbica com suporte 2h) e do PBF (2 s; poly6/spiky com suporte h), célula da grade MPM (2 s), módulo volumétrico
 * ρ₀c², parâmetros de Lamé de E/ν e o passo estável de cada algoritmo.
 */
export class ParticleMaterial extends Entity<ParticleMaterialData> implements Resource {
    /** Schema do uniform do material (dado do World; os estágios copiam os derivados para os seus parâmetros). */
    static readonly schema = new StructSchema('ParticleMaterial', {
        restDensity: FieldType.f32,
        particleSpacing: FieldType.f32,
        viscosity: FieldType.f32,
        speedOfSound: FieldType.f32,
        restitution: FieldType.f32,
        youngModulus: FieldType.f32,
        poissonRatio: FieldType.f32,
        _pad0: FieldType.f32,
        domainMin: FieldType.vec4f,
        domainMax: FieldType.vec4f,
    });

    /** Material padrão (usado quando o World não tem um). */
    static readonly defaults = new ParticleMaterial();

    /** Material do World, ou o padrão. */
    static of(world: World): ParticleMaterial {
        return (
            world.findResource(ParticleMaterial.schema, ParticleMaterial)
            ?? ParticleMaterial.defaults
        );
    }

    state: ResourceState = ResourceState.Uninitialized;

    constructor(options: ParticleMaterialOptions = {}) {
        super();
        const min = options.domainMin ?? [-2, -2, -2];
        const max = options.domainMax ?? [2, 2, 2];
        if (!min.every((v, i) => v < max[i]!)) {
            throw new RangeError(
                'ParticleMaterial: domainMin deve ser menor que domainMax em todos os eixos',
            );
        }
        const poisson = options.poissonRatio ?? 0.3;
        if (!(poisson >= 0 && poisson < 0.5)) {
            throw new RangeError(
                `ParticleMaterial: poissonRatio deve estar em [0, 0.5) (recebeu ${poisson})`,
            );
        }
        const restitution = options.restitution ?? 0.2;
        if (!(restitution >= 0 && restitution <= 1)) {
            throw new RangeError(
                `ParticleMaterial: restitution deve estar em [0, 1] (recebeu ${restitution})`,
            );
        }
        const viscosity = options.viscosity ?? 0.01;
        if (!(viscosity >= 0)) {
            throw new RangeError(`ParticleMaterial: viscosity deve ser ≥ 0 (recebeu ${viscosity})`);
        }
        this.data = {
            restDensity: positive('restDensity', options.restDensity ?? 1000),
            particleSpacing: positive('particleSpacing', options.particleSpacing ?? 0.05),
            viscosity,
            speedOfSound: positive('speedOfSound', options.speedOfSound ?? 10),
            restitution,
            youngModulus: positive('youngModulus', options.youngModulus ?? 5e4),
            poissonRatio: poisson,
            _pad0: 0,
            domainMin: [...min, 0],
            domainMax: [...max, 0],
        };
    }

    /** Densidade de repouso ρ₀ (kg/m³). */
    get restDensity(): number {
        return this.data.restDensity;
    }

    /** Espaçamento s (m). */
    get particleSpacing(): number {
        return this.data.particleSpacing;
    }

    /** Viscosidade. */
    get viscosity(): number {
        return this.data.viscosity;
    }

    /** Velocidade do som c (m/s). */
    get speedOfSound(): number {
        return this.data.speedOfSound;
    }

    /** Restituição. */
    get restitution(): number {
        return this.data.restitution;
    }

    /** Canto mínimo do domínio. */
    get domainMin(): [number, number, number] {
        const v = this.data.domainMin;
        return [v[0]!, v[1]!, v[2]!];
    }

    /** Canto máximo do domínio. */
    get domainMax(): [number, number, number] {
        const v = this.data.domainMax;
        return [v[0]!, v[1]!, v[2]!];
    }

    /** Volume de repouso de uma partícula: s³. */
    get particleVolume(): number {
        return this.particleSpacing ** 3;
    }

    /** Massa de uma partícula: ρ₀s³. */
    get particleMass(): number {
        return this.restDensity * this.particleVolume;
    }

    /** Raio de suavização do SPH (spline cúbica, suporte 2h): 1,3 s. */
    get sphSmoothingLength(): number {
        return 1.3 * this.particleSpacing;
    }

    /** Raio de suavização do PBF (poly6/spiky, suporte h): 2 s. */
    get pbfSmoothingLength(): number {
        return 2 * this.particleSpacing;
    }

    /** Célula da grade MPM: 2 s (8 partículas por célula em repouso). */
    get mpmCellSize(): number {
        return 2 * this.particleSpacing;
    }

    /** Módulo volumétrico K = ρ₀c² (fluido fracamente compressível). */
    get bulkModulus(): number {
        return this.restDensity * this.speedOfSound ** 2;
    }

    /** Rigidez da equação de Tait do SPH: k₀ = ρ₀c²/γ. */
    get taitStiffness(): number {
        return this.bulkModulus / TAIT_GAMMA;
    }

    /** Parâmetros de Lamé (μ, λ) dos sólidos MPM, de E e ν. */
    get lame(): LameParameters {
        const e = this.data.youngModulus;
        const nu = this.data.poissonRatio;
        return { mu: e / (2 * (1 + nu)), lambda: (e * nu) / ((1 + nu) * (1 - 2 * nu)) };
    }

    /** Passo estável do SPH (CFL): 0,4 h / c. */
    get sphStableDt(): number {
        return (0.4 * this.sphSmoothingLength) / this.speedOfSound;
    }

    /** Passo estável do MPM: 0,3 dx / max(c, √((λ+2μ)/ρ₀)). */
    get mpmStableDt(): number {
        const { mu, lambda } = this.lame;
        const elastic = Math.sqrt((lambda + 2 * mu) / this.restDensity);
        return (0.3 * this.mpmCellSize) / Math.max(this.speedOfSound, elastic);
    }

    /**
     * Grade que cobre o domínio com células de `cellSize`: origem no canto mínimo e dimensões arredondadas para cima
     * (usada pela vizinhança do SPH/PBF e pela grade do MPM).
     */
    gridFor(cellSize: number): ParticleGrid {
        const min = this.domainMin;
        const max = this.domainMax;
        const dim = (i: 0 | 1 | 2): number =>
            Math.max(1, Math.ceil((max[i] - min[i]) / cellSize - 1e-9));
        return { origin: min, gridDim: [dim(0), dim(1), dim(2)], cellSize };
    }

    /** Substeps necessários para avançar `stepDt` sem passar do passo estável `stableDt`. */
    static substepsFor(stepDt: number, stableDt: number, minimum = 1): number {
        return Math.max(minimum, Math.ceil(stepDt / stableDt - 1e-9));
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'material', role: 'uniform', schema: ParticleMaterial.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
