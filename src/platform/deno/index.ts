/**
 * `clayflow/deno` (spec 038) — o motor no Deno: o núcleo (`clayflow`) mais o `Application` do Deno (janela SDL ou
 * textura lida de volta), o adaptador de plataforma do Deno e a entrada da janela. Rode com
 * `deno run --unstable-webgpu --allow-ffi …` (a janela pede a SDL2 instalada).
 *
 * @packageDocumentation
 */
export * from '../../index';
export { Application } from './Application';
export type { DenoApplicationOptions } from './Application';
export { DenoPlatformAdapter } from './DenoPlatformAdapter';
export { SdlInputDevice } from './SdlInputDevice';
export { SdlWindow } from './sdl';
export type { SdlEvent } from './sdl';
