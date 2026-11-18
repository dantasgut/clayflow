import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { EffectParamsSchema } from '../flows/renderSchemas';

/**
 * Opções comuns a todos os post-process effects. Cada effect concreto
 * (Bloom, Vignette, etc.) pode estender via cast em `data`, mas estes 3 campos
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
 * Textura de trabalho de um efeito de vários passes (spec 041): do tamanho do canvas dividido por `divisor`, em
 * `rgba16float`. Declarada no trabalho do `PostFlow` (a C2 a aloca e a recria quando o canvas muda).
 */
export interface EffectTexture {
    /** Id da textura no efeito. */
    readonly id: string;
    /** O canvas dividido por este fator (arredondado para cima). */
    readonly divisor: number;
}

/**
 * O que um passe de um efeito lê: a origem do efeito (`'source'`, a cena ou o efeito anterior) ou uma das texturas de
 * trabalho dele (pelo id).
 */
export type EffectRead = readonly [resource: WgslResource, from: string];

/**
 * Um passe de um efeito antes do principal (spec 041: a pirâmide do espalhamento da lente): desenha a textura de
 * trabalho `target` do efeito com o fragmento `entry`, lendo `reads`. Com `overflow`, lê também a radiância acima do
 * teto da cor da cena (`FrameTargets.overflow`) — o módulo do efeito na variante com ela.
 */
export interface EffectStage {
    /** Id do passe no efeito. */
    readonly id: string;
    /** Fragmento. */
    readonly entry: string;
    /** A textura de trabalho desenhada. */
    readonly target: string;
    /** As leituras. */
    readonly reads: readonly EffectRead[];
    /** Lê o excesso da radiância (quando a cena o tem). */
    readonly overflow?: boolean;
}

/** Dado de um `PostProcessEffect`. */
export interface PostProcessData {
    /** Efeito ativo. */
    enabled: boolean;
    /** Intensidade do efeito. */
    strength: number;
    /** Parâmetros auxiliares do efeito. */
    aux: readonly [number, number, number];
}

/**
 * PostProcessEffect é a base de todos os post-process passes do PostFlow.
 * Cada effect contribui com 1 fragment entry point + 16 bytes de uniform
 * (strength + aux). PostFlow encadeia os effects ativos via ping-pong de
 * texturas: scene → pp[0] → pp[1] → ... → canvas.
 *
 * Built-in effects: Bloom, Blur, ChromaticAberration, ColorGrading,
 * Vignette (a apresentação, `ToneMapping`, não é efeito: é o último passe). Custom effects: implemente `fragmentModule()`
 * retornando um módulo WGSL próprio (ver método).
 *
 * Subclasses devem implementar `name` (identificador) e `fragmentEntry`
 * (nome do fragment fn no WGSL).
 */
export abstract class PostProcessEffect extends Entity<PostProcessData> implements Resource {
    state: ResourceState = ResourceState.Uninitialized;

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
     * Override opcional: módulo WGSL próprio contendo o fragment entry point (`fragmentEntry`). Quando definido, o
     * PostFlow monta um shader dedicado para este effect em vez de usar o comum. O módulo declara
     * `requires: [effectsBase]` para reutilizar os recursos (`src_tex`, `src_smp`, `params`) e o `vs_fullscreen`:
     * ```ts
     * fragmentModule() {
     *     return wgslModule({ name: 'meu_efeito', source: meuFragmento, requires: [effectsBase] });
     * }
     * ```
     */
    fragmentModule?(overflow?: boolean): WgslModule;

    /**
     * Efeitos de vários passes (spec 041): as texturas de trabalho, os passes que as desenham antes do principal (na
     * ordem) e o que o principal lê delas (além da origem). Sem eles, um passe só.
     */
    textures?(): readonly EffectTexture[];
    stages?(): readonly EffectStage[];
    mainReads?(): readonly EffectRead[];

    /** True se o effect deve participar do chain neste frame. Lê `data.enabled`. */
    get isEnabled(): boolean {
        return this.data.enabled;
    }

    /**
     * Serializa `strength + aux` em 16 bytes para upload no uniform buffer
     * do effect. Override para layouts custom — mas mantenha 16 bytes para
     * compatibilidade com o pipeline padrão.
     */
    paramsBytes(): Uint8Array {
        const aux = this.data.aux;
        return EffectParamsSchema.pack({
            p0: [this.data.strength, aux[0], aux[1], aux[2]],
        });
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
