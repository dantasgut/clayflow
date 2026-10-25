import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import { SPHSchema } from './schemas/SPHSchema';
import { PBFSchema } from './schemas/PBFSchema';
import { MPMFluidSchema } from './schemas/MPMFluidSchema';
import { MPM_REST_DEFORMATION } from './schemas/MPMSoftSchema';
import {
    ParticleBody,
    particleCount,
    repeated,
    requireLength,
    vec4Of,
    type ParticleBodyData,
    type ParticleBodyRawOptions,
    type ParticleFields,
    type ParticlePositions,
} from './ParticleBody';

/** Algoritmo de fluido, em vocabulário de domínio. */
export type FluidAlgorithm = 'SPH' | 'PBF' | 'MPM';

const FLUID_SCHEMAS: Record<FluidAlgorithm, StructSchema> = {
    SPH: SPHSchema,
    PBF: PBFSchema,
    MPM: MPMFluidSchema,
};

/**
 * Opções de domínio do FluidBody — o fluido inteiro: N partículas em arrays. O algoritmo seleciona o schema. `pos.w` é
 * do algoritmo (densidade no SPH, lambda no PBF) e não é massa — massa e volume vêm do `ParticlePhysics` da cena.
 */
export interface FluidBodyDomainOptions {
    /** Seleciona o schema e o estágio que simula (SPH, PBF ou MPM). */
    readonly algorithm: FluidAlgorithm;
    /** Posições iniciais (mundo): `x, y, z` por partícula; o tamanho define N. */
    readonly position: ParticlePositions;
    /** Velocidades iniciais: `x, y, z` por partícula. Default zero. */
    readonly velocity?: ArrayLike<number>;
}

/** Opções cruas do FluidBody: schema, contagem e dado por campo. */
export type FluidBodyRawOptions = ParticleBodyRawOptions;

/** União aceita pelo construtor do FluidBody: vocabulário de domínio ou struct cru. */
export type FluidBodyOptions = FluidBodyDomainOptions | FluidBodyRawOptions;

/** Dado de um `FluidBody`: as partículas por campo. */
export type FluidBodyData = ParticleBodyData;

function isRaw(o: FluidBodyOptions): o is FluidBodyRawOptions {
    return 'schema' in o;
}

/**
 * FluidBody — um fluido (água, fumaça, gel) de N partículas num único Resource (spec 008), na faixa de N slots do pool
 * do algoritmo (`SPHSchema`, `PBFSchema`, `MPMFluidSchema`), que roteia para o `SPHFlow`, `PBFFlow` ou `MPMFlow`.
 *
 *  - **Domínio**: `new FluidBody({ algorithm: 'SPH', position, velocity })`, com `position` = `x, y, z` por partícula.
 *  - **Cru** (avançado): `new FluidBody({ schema, count, data })`, com `data` por campo do schema.
 */
export class FluidBody extends ParticleBody {
    constructor(options: FluidBodyOptions) {
        if (isRaw(options)) {
            super('FluidBody', options.schema, options.count);
            this.data = { body: { ...options.data } };
            return;
        }
        const schema = FLUID_SCHEMAS[options.algorithm] as StructSchema | undefined;
        if (schema === undefined) {
            throw new Error(`FluidBody: algoritmo desconhecido '${options.algorithm}'`);
        }
        const count = particleCount('FluidBody', options.position);
        super('FluidBody', schema, count);
        if (options.velocity !== undefined)
            requireLength('FluidBody', 'velocity', options.velocity, count, 3);
        // pos.w / vel.w são do algoritmo (densidade, pressão, lambda): zero para o solver inicializar.
        const body: ParticleFields = {
            pos: vec4Of(options.position, count),
            vel: vec4Of(options.velocity, count),
        };
        if (options.algorithm === 'MPM') {
            // Gradiente de deformação em repouso (identidade); massa e volume vêm do `ParticlePhysics`.
            for (const [field, value] of Object.entries(MPM_REST_DEFORMATION))
                body[field] = repeated(value, count);
        }
        this.data = { body };
    }
}
