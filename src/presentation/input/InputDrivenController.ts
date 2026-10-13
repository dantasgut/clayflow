import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { Transform } from '../../elements/scene/Transform';
import type { Input } from './Input';

/**
 * Base dos controllers de câmera (`OrbitController`, `FpsController`, `FlyController`; spec 007): um Resource sem dado
 * de GPU, componente da entidade da câmera. O `InteractionSystem` chama `tick` a cada quadro com o `Input` da cena e o
 * `Transform` da mesma entidade; o controller só muta a intenção do `Transform` (posição e rotação) — as matrizes
 * são do estágio de câmera, na GPU.
 *
 * ```ts
 * app.world.insert(new Camera().add(new Transform()).add(new OrbitController({ distance: 8 })));
 * ```
 */
export abstract class InputDrivenController extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;

    /** Lê o `input` e muta `transform` (posição/rotação); `dt` em segundos. */
    abstract tick(input: Input, dt: number, transform: Transform): void;

    /** Remove ouvintes de DOM que o controller registrou (chamado quando ele sai da cena). Default: no-op. */
    dispose(): void {
        // default: no-op
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
