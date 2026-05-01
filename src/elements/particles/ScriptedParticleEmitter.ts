import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { ParticleEmitter } from './ParticleEmitter';
import type { ParticleEmitterOptions } from './ParticleEmitter';

export class ScriptedParticleEmitter extends ParticleEmitter {
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
