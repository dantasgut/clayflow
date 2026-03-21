import type { ParticleEmitter } from '../../components/particles/ParticleEmitter';

/**
 * Estratégia de atualização de partículas. (Camada 2)
 *
 * Aplica forças adicionais, turbulência, atratores ou comportamentos
 * customizados ao buffer de partículas além da integração padrão.
 *
 * Pode operar na CPU (acessa `emitter.get<Float32Array>('particleData')`) ou
 * registrar passes de compute no encoder para execução na GPU.
 *
 * @example
 * class TurbulenceUpdater implements ParticleUpdater {
 *     readonly id = 'turbulence';
 *     update(emitter, encoder, dt) { /* ... *\/ }
 * }
 */
export interface ParticleUpdater {
    readonly id: string;
    update(emitter: ParticleEmitter, encoder: GPUCommandEncoder, dt: number): void;
}
