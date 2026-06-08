import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';

/**
 * Opções comuns a todos os post-process effects. Cada effect concreto
 * (Bloom, Fxaa, etc.) pode estender via cast em `data`, mas estes 3 campos
 * são padrão e mapeiam direto pro uniform buffer de 16 bytes do shader.
 */
export interface PostProcessOptions {
    /** Liga/desliga o effect sem removê-lo do pipeline. Default: true. */
    enabled?: boolean;
    /**
     * Intensidade do effect (uniform `strength` no shader). Semântica
     * varia por effect: 0 = sem efeito; 1.0 = padrão; >1 = exagerado.
     */
    strength?: number;
    /**
     * Slot extra de 3 floats para parâmetros custom do effect (e.g.
     * Bloom usa para threshold/knee/intensity, Vignette para center+radius).
     */
    aux?: readonly [number, number, number];
}

/**
 * PostProcessEffect é a base de todos os post-process passes do PostFlow.
 * Cada effect contribui com 1 fragment entry point + 16 bytes de uniform
 * (strength + aux). PostFlow encadeia os effects ativos via ping-pong de
 * texturas: scene → pp[0] → pp[1] → ... → canvas.
 *
 * Built-in effects: Bloom, Blur, ChromaticAberration, ColorGrading, Fxaa,
 * Ssao, ToneMapping, Vignette. Custom effects: implemente `fragmentSource()`
 * retornando WGSL próprio (ver método).
 *
 * Subclasses devem implementar `name` (identificador) e `fragmentEntry`
 * (nome do fragment fn no WGSL).
 */
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

    /** Nome único do effect (e.g. 'bloom', 'fxaa'). Usado em discriminator de pipeline/buffer. */
    abstract get name(): string;
    /** Nome do fragment entry point no WGSL (e.g. 'fs_bloom'). */
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

    /** True se o effect deve participar do chain neste frame. Lê `data.enabled`. */
    get isEnabled(): boolean {
        return this.data.enabled === true;
    }

    /**
     * Serializa `strength + aux` em 16 bytes para upload no uniform buffer
     * do effect. Override para layouts custom — mas mantenha 16 bytes para
     * compatibilidade com o pipeline padrão.
     */
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

    /** Effects não declaram GPUDescriptors — params buffer é gerenciado pelo PostFlow. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [];
    }
    /** Effects não declaram PipelineDescriptors — PostFlow cria via `paramsBytes` + shader. */
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
