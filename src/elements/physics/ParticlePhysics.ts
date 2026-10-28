import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import type { World } from '../../scene/world/World';

/** Opções de domínio da física das partículas (fluidos SPH/PBF/MPM e sólidos MPM). */
export interface ParticlePhysicsOptions {
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
    /**
     * O que os limites do domínio são (spec 010): `'walls'` (default) — chão e paredes que seguram e aderem o fluido;
     * `'open'` — só a caixa de cálculo: nada colide nem adere aos planos do domínio, o fluido colide apenas com os
     * colliders da cena, e a partícula que sai da caixa é retirada (parada fora da cena, sem vizinhos nem desenho).
     */
    readonly bounds?: 'walls' | 'open';
    /**
     * Coesão — tensão superficial de Akinci et al. 2013 (SPH e PBF), adimensional (default 0, desligada): 1 dá à
     * partícula de borda uma aceleração de coesão da ordem de g. Referência de água: `ParticlePhysics.WATER_COHESION`.
     */
    readonly cohesion?: number;
    /**
     * Adesão às fronteiras sólidas (limites do domínio e colliders), adimensional (default 0, desligada): 1 dá à
     * partícula em contato uma aceleração de adesão da ordem de g. Referência de água: `ParticlePhysics.WATER_ADHESION`.
     */
    readonly adhesion?: number;
    /** Suavização de velocidade XSPH do SPH e do PBF (default 0.05). */
    readonly xsph?: number;
    /**
     * Tensão superficial física γ em N/m (spec 010; água: 0,072). Com ela, coesão e adesão vêm da física na escala do
     * espaçamento — a coesão é γ/(ρ₀ s²) em múltiplos de g, a adesão a coesão × (1 + cos θ) (Young–Dupré) e o arrasto
     * tangencial na parede o viscoso μ/(ρ₀ s²) — em vez dos valores adimensionais `cohesion`/`adhesion`, que ignoram a
     * escala (exclusivos com ela). Ver `ParticlePhysics.WATER`.
     */
    readonly surfaceTension?: number;
    /** Ângulo de contato θ com as fronteiras sólidas, em graus (spec 010; default 90 — nem molha nem repele). */
    readonly contactAngle?: number;
    /**
     * Ângulo de deslize das gotas soltas num sólido que a água molha, em graus (spec 034; default 0, sem ancoramento):
     * a borda da gota fica ancorada no sólido com a gravidade vezes o seno dele, qualquer que seja o aperto contra o
     * sólido — a gota escorre quando a gravidade ao longo da superfície passa disso (parede vertical, rampa mais
     * íngreme que o ângulo) e, no chão, depois do choque espalha, é freada e para. O volume do fluido não tem esse
     * ancoramento. Só com `contactAngle` < 90°.
     */
    readonly slidingAngle?: number;
}

/** Aceleração de referência das escalas de coesão e adesão (m/s²). */
const G0 = 9.81;
/** Fração do passo de oscilação usada no passo estável da coesão e da adesão. */
const SURFACE_CFL = 0.4;
/** Teto de substeps pela coesão/adesão, em múltiplos dos substeps sem elas (acima, os valores são grampeados). */
const SURFACE_MAX_SUBSTEP_FACTOR = 4;

/** Integral de Simpson de `f` em [a, b] com `n` intervalos (par). */
function simpson(f: (u: number) => number, a: number, b: number, n = 2048): number {
    const h = (b - a) / n;
    let sum = f(a) + f(b);
    for (let i = 1; i < n; i++) sum += (i % 2 === 1 ? 4 : 2) * f(a + i * h);
    return (sum * h) / 3;
}

/**
 * ∫₀¹ g(u) u² du do núcleo de coesão de Akinci em u = r/H (C = 32/(πH³) g(u)): a aceleração de coesão de uma partícula
 * na borda de um meio-espaço de fluido é γ ρ₀ · 32 · este valor.
 */
const COHESION_HALF_SPACE = simpson(
    (u) => (u > 0.5 ? (1 - u) ** 3 * u ** 3 : 2 * (1 - u) ** 3 * u ** 3 - 1 / 64) * u * u,
    0,
    1,
);

/**
 * ∫_{1/2}^1 a(u) u² du do núcleo de adesão de Akinci em u = r/H (A = 0,007/H³ a(u)): a integral de meio-espaço com a
 * partícula encostada na fronteira (normalização da adesão; o kernel avalia a mesma integral a distância d).
 */
const ADHESION_HALF_SPACE = simpson(
    (u) => Math.max(0, -4 * u * u + 6 * u - 2) ** 0.25 * u * u,
    0.5,
    1,
);

/** Coesão e adesão efetivas de um quadro e os substeps que elas exigem (`ParticlePhysics.surfaceStep`). */
export interface SurfaceStep {
    /** Substeps do quadro (os do passo estável do solver, ou mais pela coesão/adesão, até o teto). */
    readonly substeps: number;
    /** Coesão efetiva (a da física, ou grampeada). */
    readonly cohesion: number;
    /** Adesão efetiva (a da física, ou grampeada). */
    readonly adhesion: number;
    /** `true` quando coesão ou adesão foram grampeadas pelo teto de substeps. */
    readonly clamped: boolean;
}

/** Passo da calibração do PBF (s) e o raio de kernel em que ele vale (m): ver `ParticlePhysics.pbfStableDt`. */
const PBF_CALIBRATION_DT = 1 / 60;
const PBF_CALIBRATION_H = 0.1;

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

function nonNegative(name: string, value: number): number {
    if (!(value >= 0) || !Number.isFinite(value)) {
        throw new RangeError(`ParticlePhysics: ${name} deve ser ≥ 0 (recebeu ${value})`);
    }
    return value;
}

function positive(name: string, value: number): number {
    if (!(value > 0) || !Number.isFinite(value)) {
        throw new RangeError(`ParticlePhysics: ${name} deve ser > 0 (recebeu ${value})`);
    }
    return value;
}

/** Dado de um `ParticlePhysics` (layout de `ParticlePhysics.schema`). */
export interface ParticlePhysicsData {
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
    /** Coesão (tensão superficial), adimensional. */
    cohesion: number;
    /** Canto mínimo do domínio. */
    domainMin: number[];
    /** Canto máximo do domínio. */
    domainMax: number[];
    /** Adesão às fronteiras sólidas, adimensional. */
    adhesion: number;
    /** Suavização de velocidade XSPH. */
    xsph: number;
    /** Preenchimento do layout. */
    _pad0: number;
    /** Preenchimento do layout. */
    _pad1: number;
}

/**
 * ParticlePhysics — física dos corpos de partículas (fluidos SPH, PBF e MPM; sólidos MPM), em vocabulário de
 * domínio. Recurso único por cena, lido pelos estágios de física como o `GravityField`; sem `ParticlePhysics` no World, os
 * estágios usam os padrões (`ParticlePhysics.of(world)`).
 *
 * As grandezas numéricas dos solvers derivam dele: massa da partícula ρ₀s³, raio de suavização do SPH (1,3 s; spline
 * cúbica com suporte 2h) e do PBF (2 s; poly6/spiky com suporte h), célula da grade MPM (2 s), módulo volumétrico
 * ρ₀c², parâmetros de Lamé de E/ν e o passo estável de cada algoritmo (o do PBF escalado da calibração, spec 017).
 */
export class ParticlePhysics extends Entity<ParticlePhysicsData> implements Resource {
    /** Schema do uniform da física (dado do World; os estágios copiam os derivados para os seus parâmetros). */
    static readonly schema = new StructSchema('ParticlePhysics', {
        restDensity: FieldType.f32,
        particleSpacing: FieldType.f32,
        viscosity: FieldType.f32,
        speedOfSound: FieldType.f32,
        restitution: FieldType.f32,
        youngModulus: FieldType.f32,
        poissonRatio: FieldType.f32,
        cohesion: FieldType.f32,
        domainMin: FieldType.vec4f,
        domainMax: FieldType.vec4f,
        adhesion: FieldType.f32,
        xsph: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    });

    /**
     * Coesão de referência da água nas cenas de 2–5 cm de espaçamento (calibrada pelo smoke `fluidBehavior`: gota
     * isolada arredondada em 3 s, filete que se parte em gotas). Não é a tensão física de 0,072 N/m — nessa escala, ela
     * seria invisível.
     */
    static readonly WATER_COHESION = 3;

    /** Adesão de referência da água (calibrada pelo smoke `fluidBehavior`: menisco junto à parede). */
    static readonly WATER_ADHESION = 8;

    /** Comportamento padrão (usado quando o World não tem um). */
    static readonly defaults = new ParticlePhysics();

    /**
     * Água física (spec 010): densidade 1000 kg/m³, viscosidade dinâmica 0,001 Pa·s, tensão superficial 0,072 N/m,
     * ângulo de contato de 30° (molha), restituição zero no choque com sólidos (a gota que molha espalha, não volta) e
     * ângulo de deslize de 25° das gotas soltas (spec 034). Coesão e adesão saem na escala do espaçamento — a 2,5 cm, ~0,01 g e ~0,02 g;
     * a milímetros, dominam. Uso: `new ParticlePhysics({ ...ParticlePhysics.WATER, particleSpacing })`.
     */
    static readonly WATER = {
        restDensity: 1000,
        viscosity: 0.001,
        surfaceTension: 0.072,
        contactAngle: 30,
        restitution: 0,
        slidingAngle: 25,
    } as const;

    /**
     * Vizinhas abaixo das quais a partícula é uma gota solta (spec 034): encostada num sólido que a água molha, ela
     * representa gotas menores que a resolução, em que a borda ancorada domina (`slidingAngle`) — a mesma contagem que
     * faz o campo dos fluidos desenhá-la como gota isolada. Com outra água por perto, volta ao volume.
     */
    static readonly WET_NEIGHBORS = 8;

    /** Arrasto tangencial físico na parede (1/s), com `surfaceTension`; `undefined` no modo adimensional. */
    private readonly wallDrag: number | undefined;

    /**
     * Ângulo de contato θ com as fronteiras sólidas, em graus (90 sem `surfaceTension`: nem molha nem repele). Além da
     * adesão, dá a forma da gota pousada num sólido no campo dos fluidos (a calota que molha).
     */
    readonly contactAngle: number;

    /** Ângulo de deslize das gotas soltas, em graus (0 sem ancoramento). */
    readonly slidingAngle: number;

    /** Tensão superficial física γ (N/m); 0 no modo adimensional (`cohesion`/`adhesion`). */
    readonly surfaceTension: number;

    /** Comportamento do World, ou o padrão. */
    static of(world: World): ParticlePhysics {
        return (
            world.findResource(ParticlePhysics.schema, ParticlePhysics) ?? ParticlePhysics.defaults
        );
    }

    state: ResourceState = ResourceState.Uninitialized;

    constructor(options: ParticlePhysicsOptions = {}) {
        super();
        const min = options.domainMin ?? [-2, -2, -2];
        const max = options.domainMax ?? [2, 2, 2];
        if (!min.every((v, i) => v < max[i]!)) {
            throw new RangeError(
                'ParticlePhysics: domainMin deve ser menor que domainMax em todos os eixos',
            );
        }
        const poisson = options.poissonRatio ?? 0.3;
        if (!(poisson >= 0 && poisson < 0.5)) {
            throw new RangeError(
                `ParticlePhysics: poissonRatio deve estar em [0, 0.5) (recebeu ${poisson})`,
            );
        }
        const restitution = options.restitution ?? 0.2;
        if (!(restitution >= 0 && restitution <= 1)) {
            throw new RangeError(
                `ParticlePhysics: restitution deve estar em [0, 1] (recebeu ${restitution})`,
            );
        }
        const viscosity = options.viscosity ?? 0.01;
        if (!(viscosity >= 0)) {
            throw new RangeError(`ParticlePhysics: viscosity deve ser ≥ 0 (recebeu ${viscosity})`);
        }
        const restDensity = positive('restDensity', options.restDensity ?? 1000);
        const spacing = positive('particleSpacing', options.particleSpacing ?? 0.05);
        let cohesion = nonNegative('cohesion', options.cohesion ?? 0);
        let adhesion = nonNegative('adhesion', options.adhesion ?? 0);
        this.wallDrag = undefined;
        let contactAngle = 90;
        this.surfaceTension = 0;
        if (options.surfaceTension !== undefined) {
            if (options.cohesion !== undefined || options.adhesion !== undefined) {
                throw new RangeError(
                    'ParticlePhysics: surfaceTension (física) e cohesion/adhesion (adimensionais) são exclusivas',
                );
            }
            const gamma = nonNegative('surfaceTension', options.surfaceTension);
            const theta = options.contactAngle ?? 90;
            if (!(theta >= 0 && theta <= 180)) {
                throw new RangeError(
                    `ParticlePhysics: contactAngle deve estar em [0, 180] graus (recebeu ${theta})`,
                );
            }
            // Coesão física por massa na escala do espaçamento, em múltiplos de g; adesão por Young–Dupré.
            cohesion = gamma / (restDensity * spacing * spacing * G0);
            adhesion = cohesion * (1 + Math.cos((theta * Math.PI) / 180));
            this.wallDrag = viscosity / (restDensity * spacing * spacing);
            contactAngle = theta;
            this.surfaceTension = gamma;
        } else if (options.contactAngle !== undefined) {
            throw new RangeError('ParticlePhysics: contactAngle só vale com surfaceTension');
        }
        this.contactAngle = contactAngle;
        const sliding = options.slidingAngle ?? 0;
        if (!(sliding >= 0 && sliding <= 90)) {
            throw new RangeError(
                `ParticlePhysics: slidingAngle deve estar em [0, 90] graus (recebeu ${sliding})`,
            );
        }
        this.slidingAngle = sliding;
        this.data = {
            cohesion,
            adhesion,
            xsph: nonNegative('xsph', options.xsph ?? 0.05),
            restDensity,
            particleSpacing: spacing,
            viscosity,
            speedOfSound: positive('speedOfSound', options.speedOfSound ?? 10),
            restitution,
            youngModulus: positive('youngModulus', options.youngModulus ?? 5e4),
            poissonRatio: poisson,
            // w = 1: domínio aberto (spec 010).
            domainMin: [...min, options.bounds === 'open' ? 1 : 0],
            domainMax: [...max, 0],
            _pad0: 0,
            _pad1: 0,
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

    /** Coesão (tensão superficial), adimensional. */
    get cohesion(): number {
        return this.data.cohesion;
    }

    /** Adesão às fronteiras sólidas, adimensional. */
    get adhesion(): number {
        return this.data.adhesion;
    }

    /** Suavização de velocidade XSPH. */
    get xsph(): number {
        return this.data.xsph;
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
    /** Domínio aberto (`bounds: 'open'`, spec 010): sem paredes; o que sai da caixa é retirado. */
    get openBounds(): boolean {
        return this.data.domainMin[3] === 1;
    }

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

    /**
     * Passo estável do PBF: o passo da calibração (1/60 s com h = 0,1 m, isto é, 5 cm de espaçamento, e 4 iterações)
     * escalado por (h / 0,1)². Duas coisas encolhem com o raio do kernel: o deslocamento por substep tolerado (CFL, ∝ h)
     * e o alcance do solver de Jacobi, que propaga a correção cerca de um kernel por iteração (∝ h) — com o passo
     * fixo, abaixo de 5 cm o fluido explodia (spec 017).
     */
    get pbfStableDt(): number {
        return PBF_CALIBRATION_DT * (this.pbfSmoothingLength / PBF_CALIBRATION_H) ** 2;
    }

    /**
     * Passo estável do MPM: 0,3 dx / max(c, √((λ+2μ)/ρ₀)) e, com viscosidade, a restrição difusiva dx²ρ₀/(6 μ) da
     * tensão viscosa do fluido.
     */
    get mpmStableDt(): number {
        const { mu, lambda } = this.lame;
        const elastic = Math.sqrt((lambda + 2 * mu) / this.restDensity);
        const wave = (0.3 * this.mpmCellSize) / Math.max(this.speedOfSound, elastic);
        const viscosity = this.viscosity;
        if (viscosity <= 0) return wave;
        return Math.min(wave, (this.mpmCellSize ** 2 * this.restDensity) / (6 * viscosity));
    }

    /**
     * γ de Akinci et al. 2013 em unidades do solver, para o suporte `support` (H) da vizinhança e a coesão dada (padrão
     * a da física): a partícula na borda de um meio-espaço de fluido sente `coesão · g`.
     */
    cohesionGamma(cohesion = this.cohesion): number {
        return (cohesion * G0) / (32 * this.restDensity * COHESION_HALF_SPACE);
    }

    /**
     * Escala da adesão para o kernel (m/s²): a aceleração normal a distância d é este valor vezes a integral de
     * meio-espaço do núcleo de Akinci em [max(d/H, ½), 1] — `adesão · g` com a partícula encostada (d = 0).
     */
    adhesionAccel(adhesion = this.adhesion): number {
        return (adhesion * G0) / ADHESION_HALF_SPACE;
    }

    /**
     * Arrasto tangencial da adesão (1/s) no contato: `adesão · √(g/s)` no modo adimensional; com `surfaceTension`, o
     * viscoso da parede μ/(ρ₀ s²) (spec 010).
     */
    adhesionTangential(adhesion = this.adhesion): number {
        if (this.wallDrag !== undefined) return adhesion > 0 ? this.wallDrag : 0;
        return adhesion * Math.sqrt(G0 / this.particleSpacing);
    }

    /**
     * Substeps do quadro com coesão e adesão: o passo da oscilação que elas impõem numa partícula (aceleração `valor · g`
     * ao longo de um espaçamento, 0,4 √(s / (valor · g))) entra junto com o passo estável do solver. Até 4× os substeps
     * sem elas; acima, coesão e adesão são grampeadas ao que cabe no teto (`clamped`). Com coesão e adesão zero, devolve
     * exatamente `substepsFor(stepDt, solverStableDt, minimum)`.
     */
    surfaceStep(stepDt: number, solverStableDt: number, minimum = 1): SurfaceStep {
        const base = ParticlePhysics.substepsFor(stepDt, solverStableDt, minimum);
        const strongest = Math.max(this.cohesion, this.adhesion);
        if (strongest <= 0 || base === 0) {
            return {
                substeps: base,
                cohesion: this.cohesion,
                adhesion: this.adhesion,
                clamped: false,
            };
        }
        const s = this.particleSpacing;
        const surfaceDt = SURFACE_CFL * Math.sqrt(s / (strongest * G0));
        const needed = ParticlePhysics.substepsFor(
            stepDt,
            Math.min(solverStableDt, surfaceDt),
            minimum,
        );
        const cap = base * SURFACE_MAX_SUBSTEP_FACTOR;
        if (needed <= cap) {
            return {
                substeps: needed,
                cohesion: this.cohesion,
                adhesion: this.adhesion,
                clamped: false,
            };
        }
        // Maior valor cujo passo cabe no teto: dt = stepDt / cap ⇒ valor = s / (g (dt / 0,4)²).
        const dt = stepDt / cap;
        const limit = s / (G0 * (dt / SURFACE_CFL) ** 2);
        return {
            substeps: cap,
            cohesion: Math.min(this.cohesion, limit),
            adhesion: Math.min(this.adhesion, limit),
            clamped: true,
        };
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
        return [{ id: 'physics', role: 'uniform', schema: ParticlePhysics.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
