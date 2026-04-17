import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { PhysicsBody }          from '../../scene/components/physics/PhysicsBody';
import type { PBFBufferIds }    from './pbf/PBFBufferLayout';

export interface PBFParticleData {
    x: number; y: number; z: number;
    vx?: number; vy?: number; vz?: number;
}

export interface PBFBodyOptions {
    /** Densidade de repouso ρ₀ (kg/m³). Default: 1000. */
    restDensity?:          number;
    /** Raio de suavização h (m). Default: 0.1. */
    smoothingRadius?:      number;
    /** Relaxação do constraint (ε). Default: 600. */
    epsilon?:              number;
    /** Amplitude s_corr (anti-clustering). Default: 0.001. */
    sCorrK?:               number;
    /** Expoente s_corr. Default: 4. */
    sCorrN?:               number;
    /** Coeficiente vorticity confinement. Default: 0.01. */
    vorticityConfinement?: number;
    /** Viscosidade XSPH c. Default: 0.01. */
    xsph?:                 number;
    /** Coeficiente de restituição nas colisões. Default: 0.0. */
    restitution?:          number;
}

/**
 * Corpo PBF — fluido incompressível por Position-Based Fluids (Macklin & Müller 2013).
 *
 * Buffers GPU alocados pelo PBFComputePass (padrão MPMBody).
 */
export class PBFBody extends PhysicsBody {
    public readonly type       = 'PBFBody';
    public readonly physicType = 'PBFBody';

    public readonly acceptedAlgorithms: readonly string[] = ['PBF'];

    /** IDs de buffers GPU alocados pelo PBFComputePass. */
    public bufferIds?: PBFBufferIds;

    public particles: PBFParticleData[] = [];

    constructor(options: PBFBodyOptions = {}) {
        super();
        this.set('restDensity',          options.restDensity          ?? 1000.0);
        this.set('smoothingRadius',      options.smoothingRadius      ?? 0.1);
        this.set('epsilon',              options.epsilon              ?? 600.0);
        this.set('sCorrK',               options.sCorrK               ?? 0.001);
        this.set('sCorrN',               options.sCorrN               ?? 4);
        this.set('vorticityConfinement', options.vorticityConfinement ?? 0.01);
        this.set('xsph',                 options.xsph                 ?? 0.01);
        this.set('restitution',          options.restitution          ?? 0.0);
    }

    protected override async doAllocate(_resourceManager: ResourceManager): Promise<void> {
        // Buffers alocados pelo PBFComputePass — no-op aqui.
    }

    protected override doDispose(_resourceManager: ResourceManager): void {
        // Buffers liberados pelo PBFComputePass — no-op aqui.
    }
}
