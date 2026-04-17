import type { Entity } from '../core/Entity';
import type { PhysicsBody } from '../components/physics/PhysicsBody';
import type { vec3 } from 'gl-matrix';

/**
 * Catálogo de eventos de física despachados via EventDispatcher (Observer — GoF).
 *
 * Qualquer Entity pode ouvir estes eventos sem acoplamento ao PhysicsWorld:
 * @example
 * mesh.addEventListener('collision', (e: CollisionEvent) => {
 *     console.log('bateu em', e.other.name, 'com impulso', e.impulse);
 * });
 */

export interface CollisionEvent {
    readonly type: 'collision';
    readonly target: Entity;
    /** A outra entidade envolvida na colisão. */
    readonly other: Entity;
    /** Ponto de contato no espaço de mundo. */
    readonly contactPoint: vec3;
    /** Impulso da colisão (magnitude). */
    readonly impulse: number;
}

export interface DeformationEvent {
    readonly type: 'deformation';
    readonly target: Entity;
    /** Corpo mole que sofreu deformação. */
    readonly body: PhysicsBody;
    /** Energia de deformação acumulada neste step. */
    readonly energy: number;
}

export interface SleepEvent {
    readonly type: 'physics_sleep';
    readonly target: Entity;
}

export interface WakeEvent {
    readonly type: 'physics_wake';
    readonly target: Entity;
}

export type PhysicsEvent = CollisionEvent | DeformationEvent | SleepEvent | WakeEvent;
