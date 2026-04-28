import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { ParticleEmitter } from './ParticleEmitter';
import type { ParticleEmitterOptions } from './ParticleEmitter';

export class ComputeParticleEmitter extends ParticleEmitter {
    static readonly schema = new StructSchema('ComputeParticle', {
        position: FieldType.vec4f,
        velocity: FieldType.vec4f,
        ageAndLife: FieldType.vec4f,
        params: FieldType.vec4f,
    });

    constructor(options: ParticleEmitterOptions = {}) {
        super(options);
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{
            id: 'particles',
            role: 'storage-rw',
            schema: ComputeParticleEmitter.schema,
            count: this.data['maxParticles'] as number,
        }];
    }
}
