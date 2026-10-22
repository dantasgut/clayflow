import { wgslModule } from '../../scene/shaders/WgslModule';
import { wgslResource } from '../../scene/shaders/WgslResource';
import shadowDepthSource from './shadow_depth.wgsl?raw';
import effectsSource from './effects/effects.wgsl?raw';
import fullscreenSource from './effects/fullscreen.wgsl?raw';
import presentSource from './effects/present.wgsl?raw';
import presentSingleSource from './effects/present_single.wgsl?raw';
import presentMsSource from './effects/present_ms.wgsl?raw';
import uiSource from './ui.wgsl?raw';
import sceneCopyMipsSource from './scene_copy_mips.wgsl?raw';
import temporalResolveSource from './effects/temporal_resolve.wgsl?raw';
import temporalPresentSource from './effects/temporal_present.wgsl?raw';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import { color, present } from '../../elements/gpu/shaders/math';
import {
    camerasResource,
    shadowMatricesResource,
    worldsResource,
} from '../../elements/scene/resources';
import {
    EffectParamsSchema,
    PresentationParamsSchema,
    ScreenParamsSchema,
    ShadowDepthParamsSchema,
    ShadowInstanceSchema,
    TemporalResolveParamsSchema,
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

/** Recursos da resolução temporal (spec 034), privados do `PostFlow`. */
export const temporalResources = {
    /** Parâmetros (`TemporalResolveParams`). */
    params: wgslResource({
        name: 'taa_params',
        binding: { uniform: true },
        type: { schema: TemporalResolveParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    /** O histórico do quadro anterior (a saída da resolução de lá). */
    history: wgslResource({
        name: 'taa_history',
        binding: { texture: { sample: 'f32' } },
        frequency: 'draw',
        provider: 'private',
    }),
    /** A distância à câmera e o movimento de cada pixel no quadro anterior (rg32float), para a desoclusão. */
    historyDistance: wgslResource({
        name: 'taa_history_distance',
        binding: { texture: { sample: 'f32' } },
        frequency: 'draw',
        provider: 'private',
    }),
    /** A luz que chega a cada pixel neste quadro (`FrameTargets.light`: r direta, g total). */
    light: wgslResource({
        name: 'taa_light',
        binding: { texture: { sample: 'f32' } },
        frequency: 'draw',
        provider: 'private',
    }),
    /** A luz que chegava a cada pixel no quadro anterior (rg16float: direta, total), para a mudança de iluminação. */
    historyLight: wgslResource({
        name: 'taa_history_light',
        binding: { texture: { sample: 'f32' } },
        frequency: 'draw',
        provider: 'private',
    }),
    /** Os vetores de movimento (`FrameTargets.motion`). */
    motion: wgslResource({
        name: 'taa_motion',
        binding: { texture: { sample: 'f32' } },
        frequency: 'draw',
        provider: 'private',
    }),
    /** A profundidade da cena (`FrameTargets.depth`, sem MSAA). */
    depth: wgslResource({
        name: 'taa_depth',
        binding: { texture: { sample: 'depth' } },
        frequency: 'draw',
        provider: 'private',
    }),
} as const;

/** Resolução temporal: a cor deslocada do quadro mais o histórico reprojetado e recortado (spec 034, R3). */
export const temporalResolve = wgslModule({
    name: 'temporal_resolve',
    source: temporalResolveSource,
    requires: [
        fullscreen,
        camerasResource,
        temporalResources.params,
        effectResources.source,
        temporalResources.history,
        temporalResources.historyDistance,
        temporalResources.light,
        temporalResources.historyLight,
        temporalResources.depth,
        temporalResources.motion,
        effectResources.sampler,
    ],
});

/** Nitidez adaptativa ao movimento depois da resolução (spec 034): o mesmo módulo, outra entrada. */
export const temporalSharpen = wgslModule({
    name: 'temporal_sharpen',
    source: temporalResolveSource,
    requires: [
        fullscreen,
        camerasResource,
        temporalResources.params,
        effectResources.source,
        temporalResources.history,
        temporalResources.historyDistance,
        temporalResources.light,
        temporalResources.historyLight,
        temporalResources.depth,
        temporalResources.motion,
        effectResources.sampler,
    ],
});

/** Nitidez e apresentação no mesmo passe, sem efeitos de pós (spec 034, G2): a imagem resolvida vai direto ao canvas. */
export const temporalPresent = wgslModule({
    name: 'temporal_present',
    source: temporalPresentSource,
    requires: [temporalSharpen, presentCommon],
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

/** Recursos do kernel dos mips da cópia da cena (spec 011), privados do estágio. */
export const sceneMipResources = {
    /** O nível anterior (view de um nível). */
    src: wgslResource({
        name: 'scene_mip_src',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: 'private',
    }),
    /** O nível escrito (view de storage de um nível). */
    dst: wgslResource({
        name: 'scene_mip_dst',
        binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
        frequency: 'stage',
        provider: 'private',
    }),
    /** Amostrador linear. */
    sampler: wgslResource({
        name: 'scene_mip_sampler',
        binding: { sampler: 'filtering' },
        frequency: 'stage',
        provider: 'private',
    }),
} as const;

/** Redução de um nível da cópia da cena (tenda 4×4). */
export const sceneCopyMips = wgslModule({
    name: 'scene_copy_mips',
    source: sceneCopyMipsSource,
    requires: [
        WORKGROUP_SIZE.module,
        sceneMipResources.src,
        sceneMipResources.dst,
        sceneMipResources.sampler,
    ],
});
