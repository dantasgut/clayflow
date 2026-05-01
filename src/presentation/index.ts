/**
 * Camada 4 — Presentation API pública.
 *
 * Esta é a "fronteira" recomendada para apps que consomem a engine. O default
 * é importar tudo aqui (`Application`, `Camera`, `BoxGeometry`, controllers,
 * effects, etc.) e usar `Application.create({ canvas })` como bootstrap.
 *
 * Para implementar Resources/Flows customizados, importe diretamente de
 * `webgpu-engine` (que re-exporta este barrel + `core/`+`scene/` types).
 *
 * @packageDocumentation
 */
export * from './app/index';
export * from './flows/index';
export * from './input/index';
export * from './assets/index';
export * from './ui/index';
export * from './plugins/index';
export { PostProcessEffect } from './resources/PostProcessEffect';
export type { PostProcessOptions } from './resources/PostProcessEffect';
