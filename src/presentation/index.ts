/**
 * Camada 4 — Presentation API pública.
 *
 * O que não depende do ambiente (spec 038): o `Engine`, os controllers, os efeitos, a UI. O `Application` sobre um
 * canvas e o que é do navegador (entrada do DOM, carregadores) estão no `clayflow/web`; o do Deno, no `clayflow/deno`.
 *
 * Para implementar Resources/Flows customizados, importe diretamente de
 * `webgpu-engine` (que re-exporta este barrel + `core/`+`scene/` types).
 *
 * @packageDocumentation
 */
export * from './app/index';
export * from './flows/index';
export * from './input/index';
export * from './ui/index';
export type * from './plugins/index';
export { PostProcessEffect } from './resources/PostProcessEffect';
export type { PostProcessData, PostProcessOptions } from './resources/PostProcessEffect';
export { ToneMapping } from './resources/ToneMapping';
export { SceneRenderer } from './resources/SceneRenderer';
export type {
    PresentationOutput,
    ToneMappingData,
    ToneMappingOptions,
    ToneOperator,
} from './resources/ToneMapping';
