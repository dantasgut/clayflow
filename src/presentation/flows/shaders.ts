import { wgslModule } from '../../scene/shaders/WgslModule';
import shadowDepthSource from './shadow_depth.wgsl?raw';
import effectsSource from './effects/effects.wgsl?raw';
import uiSource from './ui.wgsl?raw';
import { Transform } from '../../elements/scene/Transform';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import { color } from '../../elements/gpu/shaders/math';
import {
    EffectParamsSchema,
    ScreenParamsSchema,
    ShadowDepthParamsSchema,
    UiQuadSchema,
} from './renderSchemas';

/** Profundidade do mapa de sombra (só vértice). */
export const shadowDepth = wgslModule({
    name: 'shadow_depth',
    source: shadowDepthSource,
    structs: [ShadowDepthParamsSchema, ShadowMap.schema, Transform.worldSchema],
});

/**
 * Base do pós-processamento: bindings da textura de origem e dos parâmetros, `vs_fullscreen` e os fragmentos dos
 * efeitos padrão. Efeitos próprios declaram um módulo com `requires: [effectsBase]` e o seu fragmento.
 */
export const effectsBase = wgslModule({
    name: 'effects_base',
    source: effectsSource,
    requires: [color],
    structs: [EffectParamsSchema],
});

/** Quads de UI (painéis e glifos). */
export const ui = wgslModule({
    name: 'ui',
    source: uiSource,
    structs: [UiQuadSchema, ScreenParamsSchema],
});
