import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { PhysicsBody }          from '../../scene/components/physics/PhysicsBody';
import type { SPHBufferIds }    from './sph/SPHBufferLayout';

export interface SPHParticleData {
    x: number; y: number; z: number;
    vx?: number; vy?: number; vz?: number;
}

export interface SPHBodyOptions {
    /** Densidade de repouso ρ₀ (kg/m³). Default: 1000. */
    restDensity?:     number;
    /** Raio de suavização h (m). Default: 0.1. */
    smoothingRadius?: number;
    /** Rigidez da equação de estado k₀ (Pa). Default: 200. */
    stiffness?:       number;
    /** Expoente γ da EOS WCSPH. Default: 7. */
    gamma?:           number;
    /** Viscosidade dinâmica μ. Default: 0.01. */
    viscosity?:       number;
    /** Coeficiente XSPH c. Default: 0.01. */
    xsph?:            number;
    /** Massa por partícula (kg). Default: 0.02. */
    particleMass?:    number;
    /** Coeficiente de restituição nas colisões. Default: 0.0. */
    restitution?:     number;
}

/**
 * Corpo SPH — fluido WCSPH (Weakly Compressible SPH).
 *
 * Buffers GPU alocados pelo SPHComputePass (padrão MPMBody/PBFBody).
 */
export class SPHBody extends PhysicsBody {
    public readonly type       = 'SPHBody';
    public readonly physicType = 'SPHBody';

    public readonly acceptedAlgorithms: readonly string[] = ['SPH'];

    public bufferIds?: SPHBufferIds;
    public particles: SPHParticleData[] = [];

    constructor(options: SPHBodyOptions = {}) {
        super();
        this.set('restDensity',     options.restDensity     ?? 1000.0);
        this.set('smoothingRadius', options.smoothingRadius ?? 0.1);
        this.set('stiffness',       options.stiffness       ?? 200.0);
        this.set('gamma',           options.gamma           ?? 7.0);
        this.set('viscosity',       options.viscosity       ?? 0.01);
        this.set('xsph',            options.xsph            ?? 0.01);
        this.set('particleMass',    options.particleMass    ?? 0.02);
        this.set('restitution',     options.restitution     ?? 0.0);
    }

    protected override async doAllocate(_resourceManager: ResourceManager): Promise<void> {}
    protected override doDispose(_resourceManager: ResourceManager): void {}
}
