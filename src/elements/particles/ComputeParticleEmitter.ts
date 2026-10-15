import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { ParticleEmitter } from './ParticleEmitter';
import type { ParticleEmitterOptions } from './ParticleEmitter';

/**
 * Emissor cuja simulação roda inteira na GPU (spec 009): o `EmitterFlow` cria `rate` partículas por segundo (contadas a
 * cada passo da física), integra gravidade e campos e mata as que passam de `lifetime`, num anel de `maxParticles`.
 * A criação é a forma do emissor (`shape`: ponto, esfera ou cone; padrão ponto na origem) ou uma `EmitFunction`
 * anexada; `seed` muda o sorteio. Desenho: uma `PointCloudGeometry` com `maxPoints = maxParticles` na mesma entidade
 * (os vértices são escritos pelo estágio) com um material de pontos.
 */
export class ComputeParticleEmitter extends ParticleEmitter {
    /** StructSchema da partícula compute (position + velocity + ageAndLife + params). */
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
        return [
            {
                id: 'particles',
                role: 'storage-rw',
                schema: ComputeParticleEmitter.schema,
                count: this.data.maxParticles,
                // Escrito só pela GPU (`EmitterFlow`): começa zerado — nenhuma partícula viva.
                upload: 'never',
            },
        ];
    }
}
