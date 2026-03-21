import type { PhysicsStage }        from '../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../scene/systems/PhysicsStageContext';
import type { vec3 } from 'gl-matrix';

/**
 * Estágio 6: coloca corpos em repouso (sleeping) quando velocidades lineares
 * e angulares ficam abaixo dos limiares por tempo suficiente.
 *
 * Corpos adormecidos são ignorados por ForceStage, IntegrationStage e pela
 * sincronização de worldMatrix no BroadphaseStage — reduzindo custo e
 * eliminando micro-impulsos que mantinham objetos girando indefinidamente.
 *
 * CollisionResolutionStage acorda corpos (isSleeping=false) ao aplicar impulso.
 */
export class SleepStage implements PhysicsStage {
    private readonly linearThreshold:  number;
    private readonly angularThreshold: number;
    private readonly sleepDelay:       number;

    constructor(options: {
        linearThreshold?:  number;
        angularThreshold?: number;
        sleepDelay?:       number;
    } = {}) {
        this.linearThreshold  = options.linearThreshold  ?? 0.05;   // m/s
        this.angularThreshold = options.angularThreshold ?? 0.1;    // rad/s
        this.sleepDelay       = options.sleepDelay       ?? 0.5;    // segundos
    }

    public execute(context: PhysicsStageContext, dt: number): void {
        for (const { body } of context.bodies.values()) {
            if (body.get<boolean>('isKinematic') || body.get<boolean>('isSleeping')) continue;

            const v = body.get<vec3>('velocity');
            const w = body.get<vec3>('angularVelocity');

            const v2 = v ? (v[0] ?? 0) ** 2 + (v[1] ?? 0) ** 2 + (v[2] ?? 0) ** 2 : 0;
            const w2 = w ? (w[0] ?? 0) ** 2 + (w[1] ?? 0) ** 2 + (w[2] ?? 0) ** 2 : 0;

            const quiet = v2 < this.linearThreshold ** 2 && w2 < this.angularThreshold ** 2;

            if (quiet) {
                const timer = (body.get<number>('sleepTimer') ?? 0) + dt;
                body.set('sleepTimer', timer);
                if (timer >= this.sleepDelay) {
                    body.set('isSleeping', true);
                    // Zera velocidades residuais para não acumular deriva
                    if (v) { v[0] = 0; v[1] = 0; v[2] = 0; }
                    if (w) { w[0] = 0; w[1] = 0; w[2] = 0; }
                }
            } else {
                body.set('sleepTimer', 0);
            }
        }
    }
}
