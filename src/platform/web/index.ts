/**
 * `clayflow/web` (spec 038) — o motor no navegador: o núcleo (`clayflow`) mais o `Application` sobre um `<canvas>`, o
 * adaptador de plataforma do navegador, o laço pelo `requestAnimationFrame`, a entrada do DOM, o `FpsController`
 * (pointer lock), a interação da UI e os carregadores (texturas, glTF, heightmap, áudio, fontes).
 *
 * @packageDocumentation
 */
export * from '../../index';
export { Application } from './Application';
export type { ApplicationOptions } from './Application';
export { WebPlatformAdapter } from './WebPlatformAdapter';
export { animationFrameScheduler } from './AnimationFrameScheduler';
export { KeyboardDevice } from './input/KeyboardDevice';
export { PointerDevice } from './input/PointerDevice';
export { GamepadDevice } from './input/GamepadDevice';
export { TouchDevice } from './input/TouchDevice';
export { FpsController } from './input/FpsController';
export type { FpsControllerOptions } from './input/FpsController';
export { UiInteractionHandler } from './ui/UiInteractionHandler';
export * from './assets/index';
