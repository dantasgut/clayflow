import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { ParticleEmitter } from './ParticleEmitter';
import type { ParticleEmitterOptions } from './ParticleEmitter';

/**
 * Emitter cuja simulação roda em CPU (TS) — atualiza pos/vel/age via
 * callback do app. Útil para efeitos com poucas partículas e lógica
 * complexa (logo, prefer ComputeParticleEmitter para 10k+ particles).
 */
export class ScriptedParticleEmitter extends ParticleEmitter {
    /** StructSchema da partícula scripted (position + velocity + ageAndLife). */
    static readonly schema = new StructSchema('ScriptedParticle', {
        position: FieldType.vec4f,
        velocity: FieldType.vec4f,
        ageAndLife: FieldType.vec4f,
    });

    constructor(options: ParticleEmitterOptions = {}) {
        super(options);
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'particles',
                role: 'storage-rw',
                schema: ScriptedParticleEmitter.schema,
                count: this.data.maxParticles as number,
            },
        ];
    }
}
