import type { NarrowphaseConfig } from '../collision/NarrowphaseConfig';

/**
 * Configuração do pipeline de detecção de colisão.
 *
 * Agrupa parâmetros que pertencem à detecção de contatos, independente
 * do tipo de corpo (RigidBody, SoftBody ou futuros tipos).
 * Broadphase é configurado diretamente em PhysicsWorldOptions pois é
 * uma estratégia trocável em nível de mundo.
 */
export interface CollisionSimConfig {
    /** Algoritmos de narrowphase por par de formas (Registry pattern). */
    narrowphase?: NarrowphaseConfig;
    /**
     * Habilita contatos especulativos anti-tunneling.
     * Testa posições previstas (pos + vel·dt) para pares sem contato atual,
     * gerando contatos preventivos antes da penetração ocorrer.
     * Default: false.
     */
    predictiveContacts?: boolean;
    /** Velocidade relativa mínima (m/s) para ativar contatos especulativos. Default: 2.0. */
    predictiveContactsThreshold?: number;
}
