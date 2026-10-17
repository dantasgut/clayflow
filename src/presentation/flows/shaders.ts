import { wgslModule } from '../../scene/shaders/WgslModule';
import { wgslResource } from '../../scene/shaders/WgslResource';
import shadowDepthSource from './shadow_depth.wgsl?raw';
import effectsSource from './effects/effects.wgsl?raw';
import fullscreenSource from './effects/fullscreen.wgsl?raw';
import presentSource from './effects/present.wgsl?raw';
import presentSingleSource from './effects/present_single.wgsl?raw';
import presentMsSource from './effects/present_ms.wgsl?raw';
import uiSource from './ui.wgsl?raw';
import { color, present } from '../../elements/gpu/shaders/math';
import { shadowMatricesResource, worldsResource } from '../../elements/scene/resources';
import {
    EffectParamsSchema,
    PresentationParamsSchema,
    ScreenParamsSchema,
    ShadowDepthParamsSchema,
    ShadowInstanceSchema,
    UiQuadSchema,
} from './renderSchemas';

/** Recursos do passe de profundidade da sombra (spec 031, R1). */
export const shadowResources = {
    /** Parâmetros do passe (`ShadowDepthParams`: slot do caster), privado do `ShadowFlow`. */
    params: wgslResource({
        name: 'shadow',
        binding: { uniform: true },
        type: { schema: ShadowDepthParamsSchema },
        frequency: 'stage',
        provider: 'private',
    }),
    /** Lista de instâncias dos grupos de profundidade (slot `casters`). */
    instances: wgslResource({
        name: 'instances',
        binding: { storage: 'read' },
        type: { schema: ShadowInstanceSchema, array: true },
        frequency: 'stage',
        provider: { slot: 'casters', part: 'instances' },
    }),
} as const;

/** Profundidade do mapa de sombra (só vértice). */
export const shadowDepth = wgslModule({
    name: 'shadow_depth',
    source: shadowDepthSource,
    requires: [
        shadowResources.params,
        shadowMatricesResource,
        worldsResource,
        shadowResources.instances,
    ],
});

/**
 * Recursos do pós-processamento (spec 031, R1), todos privados do `PostFlow`: a textura de origem e os parâmetros por
 * passe (`{ pipeline, resource }`), o amostrador comum à cadeia.
 */
export const effectResources = {
    /** Textura de origem do passe (a cena ou o pingue-pongue anterior). */
    source: wgslResource({
        name: 'src_tex',
        binding: { texture: { sample: 'f32' } },
        frequency: 'draw',
        provider: 'private',
    }),
    /** Amostrador linear da origem. */
    sampler: wgslResource({
        name: 'src_smp',
        binding: { sampler: 'filtering' },
        frequency: 'draw',
        provider: 'private',
    }),
    /** Parâmetros do efeito (`EffectParams`). */
    params: wgslResource({
        name: 'params',
        binding: { uniform: true },
        type: { schema: EffectParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
} as const;

/** Triângulo de tela cheia (`VsOut`, `vs_fullscreen`) dos passes de tela. */
export const fullscreen = wgslModule({ name: 'fullscreen', source: fullscreenSource });

/**
 * Base do pós-processamento: recursos da textura de origem, do amostrador e dos parâmetros, `vs_fullscreen` e os
 * fragmentos dos efeitos padrão. Efeitos próprios declaram um módulo com `requires: [effectsBase]` e o seu fragmento.
 */
export const effectsBase = wgslModule({
    name: 'effects_base',
    source: effectsSource,
    requires: [
        fullscreen,
        color,
        effectResources.source,
        effectResources.sampler,
        effectResources.params,
    ],
});

/** Recursos da apresentação (spec 011), privados do `PostFlow`. */
export const presentResources = {
    /** Parâmetros (`PresentationParams`), empacotados do `ToneMapping` da cena. */
    params: wgslResource({
        name: 'presentation',
        binding: { uniform: true },
        type: { schema: PresentationParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    /** A cor multiamostrada da cena (`FrameTargets.samples`), para o resolve mapeado por amostra. */
    samples: wgslResource({
        name: 'src_ms',
        binding: { texture: { sample: 'f32', multisampled: true } },
        frequency: 'draw',
        provider: 'private',
    }),
} as const;

/** Mapeamento e saída da apresentação (comum às duas entradas). */
const presentCommon = wgslModule({
    name: 'present_common',
    source: presentSource,
    requires: [present, presentResources.params],
});

/** Apresentação de uma imagem resolvida (a cor da cena sem MSAA, ou a saída do último efeito). */
export const presentSingle = wgslModule({
    name: 'present_single',
    source: presentSingleSource,
    requires: [fullscreen, presentCommon, effectResources.source],
});

/** Apresentação com resolve mapeado por amostra (MSAA, sem efeitos). */
export const presentMultisampled = wgslModule({
    name: 'present_ms',
    source: presentMsSource,
    requires: [fullscreen, presentCommon, presentResources.samples],
});

/** Recursos da UI (spec 031, R1), privados do `UIFlow` (`UiGpuPipeline`). */
export const uiResources = {
    /** Tamanho da tela em pixels. */
    screen: wgslResource({
        name: 'screen',
        binding: { uniform: true },
        type: { schema: ScreenParamsSchema },
        frequency: 'stage',
        provider: 'private',
    }),
    /** Quads achatados da árvore. */
    quads: wgslResource({
        name: 'quads',
        binding: { storage: 'read' },
        type: { schema: UiQuadSchema, array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    /** Atlas da fonte (ou um texel branco). */
    atlas: wgslResource({
        name: 'atlas',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: 'private',
    }),
    /** Amostrador do atlas. */
    sampler: wgslResource({
        name: 'atlas_smp',
        binding: { sampler: 'filtering' },
        frequency: 'stage',
        provider: 'private',
    }),
} as const;

/** Quads de UI (painéis e glifos). */
export const ui = wgslModule({
    name: 'ui',
    source: uiSource,
    requires: [uiResources.screen, uiResources.quads, uiResources.atlas, uiResources.sampler],
});
