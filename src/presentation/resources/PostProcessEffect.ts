import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';

export interface PostProcessOptions {
    enabled?: boolean;
    strength?: number;
    aux?: readonly [number, number, number];
}

export abstract class PostProcessEffect extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    constructor(options: PostProcessOptions = {}) {
        super();
        this.data = {
            enabled: options.enabled ?? true,
            strength: options.strength ?? 1.0,
            aux: options.aux ?? [0, 0, 0],
        };
    }

    abstract get name(): string;
    abstract get fragmentEntry(): string;

    /**
     * Override opcional: retorna WGSL source customizado contendo o
     * fragment entry point (`fragmentEntry`). Quando definido, PostFlow cria
     * um `ShaderModuleSpec` dedicado para este effect em vez de usar o
     * `effects.wgsl` monolítico. Útil para custom effects sem editar a engine.
     *
     * O source DEVE também conter um vertex entry — ou reutilizar
     * `vs_fullscreen` do effects.wgsl via concatenação se desejar:
     * ```ts
     * fragmentSource() { return effectsBase + this.customFs; }
     * ```
     */
    fragmentSource?(): string;

    get isEnabled(): boolean {
        return this.data.enabled === true;
    }

    paramsBytes(): Uint8Array {
        const buf = new ArrayBuffer(16);
        const f32 = new Float32Array(buf);
        f32[0] = (this.data.strength as number) ?? 1.0;
        const aux = (this.data.aux as readonly number[]) ?? [0, 0, 0];
        f32[1] = aux[0] ?? 0;
        f32[2] = aux[1] ?? 0;
        f32[3] = aux[2] ?? 0;
        return new Uint8Array(buf);
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [];
    }
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
