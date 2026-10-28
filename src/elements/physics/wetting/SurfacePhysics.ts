import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Opções da física da superfície de um sólido diante da água (`SurfacePhysics`). */
export interface SurfacePhysicsOptions {
    /** Razão de Wenzel: área real sobre a aparente, ≥ 1 (default 1, lisa). */
    readonly roughness?: number;
    /** Histerese do ângulo de contato no sólido liso, θ_avanço − θ_recuo, em graus (default 10). */
    readonly hysteresis?: number;
    /**
     * Ângulo de contato de Young da água neste sólido, em graus; sem ele, o do líquido (`ParticlePhysics.contactAngle`,
     * ou o da água de referência).
     */
    readonly contactAngle?: number;
    /** Fração de vazios do material, em [0, 1) (default 0, impermeável). */
    readonly porosity?: number;
    /**
     * Raio efetivo dos capilares (m), com a tortuosidade embutida: o que reproduz a sortividade medida do material
     * (default 0).
     */
    readonly poreRadius?: number;
    /** Espessura da camada que absorve (m) (default 0). */
    readonly thickness?: number;
    /** Temperatura da superfície (°C); sem ela, a do ar (`Atmosphere`). */
    readonly temperature?: number;
}

/** Dado de um `SurfacePhysics` (layout de `SurfacePhysics.schema`). */
export interface SurfacePhysicsData {
    roughness: number;
    hysteresis: number;
    /** Ângulo de Young em graus; −1 sem ele (o do líquido). */
    contactAngle: number;
    porosity: number;
    poreRadius: number;
    thickness: number;
    /** Temperatura em °C; NaN sem ela (a do ar). */
    temperature: number;
    _pad0: number;
}

function check(name: string, value: number, ok: boolean): number {
    if (!ok || !Number.isFinite(value)) {
        throw new RangeError(`SurfacePhysics: ${name} fora do domínio (recebeu ${value})`);
    }
    return value;
}

/**
 * SurfacePhysics — a física da superfície de um sólido diante da água (Camada 3, spec 034), componente da entidade do
 * collider: o que faz a água que o toca espalhar, escorrer, ser absorvida e secar nele. Separada do material (a
 * aparência pelo grafo): é a física, como o `ParticlePhysics` das partículas.
 *
 * - Rugosidade (Wenzel): amplia o que o material é — o hidrofílico molha mais — e a histerese: a borda da película
 *   segura mais água parada antes de romper e escorrer (Furmidge), e o atrito na área real freia o escoamento.
 * - Porosidade (Lucas–Washburn): a água livre entra nos poros com A² = W t até a capacidade φ × espessura; a superfície
 *   saturada escurece.
 * - Temperatura: com a do ar e a umidade do `Atmosphere`, a taxa de evaporação (Carrier); a água absorvida seca mais
 *   devagar, pela taxa decrescente.
 *
 * Sem `SurfacePhysics`, o sólido é o padrão (`SurfacePhysics.defaults`: liso e impermeável). Os presets
 * (`SurfacePhysics.GLASS`, `CONCRETE`…) são opções: `new SurfacePhysics(SurfacePhysics.CONCRETE)`.
 *
 * ```ts
 * app.world.insert(new BoxGeometry().add(new BoxCollider({ … })).add(new SurfacePhysics(SurfacePhysics.CONCRETE)));
 * ```
 */
export class SurfacePhysics extends Entity<SurfacePhysicsData> implements Resource {
    /** Schema do dado (a ordem das superfícies na cena vem da consulta por ele). */
    static readonly schema = new StructSchema('SurfacePhysics', {
        roughness: FieldType.f32,
        hysteresis: FieldType.f32,
        contactAngle: FieldType.f32,
        porosity: FieldType.f32,
        poreRadius: FieldType.f32,
        thickness: FieldType.f32,
        temperature: FieldType.f32,
        _pad0: FieldType.f32,
    });

    /** Superfícies distintas que a película distingue numa cena (as demais ficam com o padrão). */
    static readonly MAX = 32;

    /** Vidro limpo: liso, histerese de ~5°, impermeável. */
    static readonly GLASS: SurfacePhysicsOptions = { roughness: 1, hysteresis: 5 };

    /** Cerâmica vidrada (azulejo): quase lisa, histerese de ~15°, impermeável. */
    static readonly GLAZED_TILE: SurfacePhysicsOptions = { roughness: 1.05, hysteresis: 15 };

    /**
     * Concreto: ângulo da água de ~50°, rugoso (r ≈ 1,6), histerese de ~40°, porosidade de 15 % numa camada de 2 cm e
     * a sortividade medida de ~0,1 mm/√s (ASTM C1585): raio efetivo de 19 nm.
     */
    static readonly CONCRETE: SurfacePhysicsOptions = {
        contactAngle: 50,
        roughness: 1.6,
        hysteresis: 40,
        porosity: 0.15,
        poreRadius: 1.92e-8,
        thickness: 0.02,
    };

    /**
     * Tijolo cerâmico: ângulo da água de ~45°, r ≈ 1,4, histerese de ~35°, porosidade de 30 % em 2 cm e a sortividade
     * de ~0,3 mm/√s: raio efetivo de 39 nm.
     */
    static readonly BRICK: SurfacePhysicsOptions = {
        contactAngle: 45,
        roughness: 1.4,
        hysteresis: 35,
        porosity: 0.3,
        poreRadius: 3.93e-8,
        thickness: 0.02,
    };

    /** O sólido sem `SurfacePhysics`: liso e impermeável, com a histerese padrão. */
    static readonly defaults = new SurfacePhysics();

    state: ResourceState = ResourceState.Uninitialized;

    constructor(options: SurfacePhysicsOptions = {}) {
        super();
        const roughness = options.roughness ?? 1;
        const hysteresis = options.hysteresis ?? 10;
        const porosity = options.porosity ?? 0;
        const poreRadius = options.poreRadius ?? 0;
        const thickness = options.thickness ?? 0;
        const angle = options.contactAngle;
        const temperature = options.temperature;
        this.data = {
            roughness: check('roughness', roughness, roughness >= 1),
            hysteresis: check('hysteresis', hysteresis, hysteresis >= 0 && hysteresis <= 180),
            contactAngle:
                angle === undefined ? -1 : check('contactAngle', angle, angle >= 0 && angle <= 180),
            porosity: check('porosity', porosity, porosity >= 0 && porosity < 1),
            poreRadius: check('poreRadius', poreRadius, poreRadius >= 0),
            thickness: check('thickness', thickness, thickness >= 0),
            temperature:
                temperature === undefined
                    ? NaN
                    : check('temperature', temperature, temperature > -273.15),
            _pad0: 0,
        };
    }

    /** Razão de Wenzel. */
    get roughness(): number {
        return this.data.roughness;
    }

    /** Histerese do ângulo de contato no sólido liso (graus). */
    get hysteresis(): number {
        return this.data.hysteresis;
    }

    /** Ângulo de Young próprio (graus), ou `undefined` (o do líquido). */
    get contactAngle(): number | undefined {
        return this.data.contactAngle < 0 ? undefined : this.data.contactAngle;
    }

    /** Fração de vazios. */
    get porosity(): number {
        return this.data.porosity;
    }

    /** Raio efetivo dos capilares (m). */
    get poreRadius(): number {
        return this.data.poreRadius;
    }

    /** Espessura da camada que absorve (m). */
    get thickness(): number {
        return this.data.thickness;
    }

    /** Temperatura própria (°C), ou `undefined` (a do ar). */
    get temperature(): number | undefined {
        return Number.isNaN(this.data.temperature) ? undefined : this.data.temperature;
    }

    /** Sem dado de GPU: o estágio da película leva as grandezas derivadas ao uniform do campo. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
