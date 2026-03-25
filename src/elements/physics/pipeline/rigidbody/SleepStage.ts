import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { vec3 } from 'gl-matrix';

/**
 * Estágio 6 do pipeline de física — Gerenciamento de sono (sleeping).
 *
 * Corpos que ficam suficientemente quietos por tempo suficiente são colocados em
 * sono (`isSleeping = true`), eliminando custo computacional e micro-impulsos
 * residuais que manteriam objetos em repouso com movimento fantasma.
 *
 * **Critério de sono (timer):**
 *   Um corpo entra no temporizador de sono quando:
 *     |v|  < linearThreshold   (padrão: 0.1 m/s)
 *     |ω|  < angularThreshold  (padrão: 0.2 rad/s)
 *   Se essa condição persistir por `sleepDelay` segundos (padrão: 0.5s), o corpo
 *   dorme. O temporizador é zerado imediatamente se qualquer limiar for excedido.
 *
 * **Sono imediato (snap-to-zero):**
 *   Quando |v|² e |ω|² ficam abaixo de 1% dos limiares² (velocidades micro-residuais
 *   que jamais causariam movimento visível), o corpo dorme imediatamente sem esperar
 *   o timer. Isso resolve o problema de asymptotic-never-reaches-zero do damping
 *   exponencial: com damping suficiente v → 0 muito lentamente, mas permanece acima
 *   do threshold por tempo suficiente para resetar o timer a cada substep.
 *
 * **Efeito do sono:**
 *   Corpos adormecidos são ignorados por:
 *   - ForceStage    — nenhuma força ou solver aplicado.
 *   - BroadphaseStage — worldMatrix não é resincronizada (posição física estável).
 *   - IntegrationStage — posição e rotação não integradas.
 *   Velocidades residuais são zeradas ao adormecer, prevenindo deriva acumulada.
 *
 * **Despertar:**
 *   O CollisionResolutionStage acorda qualquer corpo adormecido (`isSleeping=false`)
 *   no momento em que um impulso de colisão é aplicado — garantindo que corpos
 *   em repouso respondam imediatamente a interações externas.
 */
export interface SleepStageOptions {
    /** Limiar de velocidade linear para ativar o timer de sono (m/s). Default: 0.1. */
    linearThreshold?:  number;
    /** Limiar de velocidade angular para ativar o timer de sono (rad/s). Default: 0.2. */
    angularThreshold?: number;
    /** Tempo que o corpo deve permanecer quieto antes de dormir (segundos). Default: 0.5. */
    sleepDelay?:       number;
}

export class SleepStage implements PhysicsStage {
    private readonly linearThreshold:  number;
    private readonly angularThreshold: number;
    private readonly sleepDelay:       number;

    constructor(options: SleepStageOptions = {}) {
        this.linearThreshold  = options.linearThreshold  ?? 0.1;    // m/s
        this.angularThreshold = options.angularThreshold ?? 0.2;    // rad/s
        this.sleepDelay       = options.sleepDelay       ?? 0.5;    // segundos
    }

    public execute(context: PhysicsStageContext, dt: number): void {
        const linThresh2  = this.linearThreshold  ** 2;
        const angThresh2  = this.angularThreshold ** 2;
        // Snap-to-zero: 1% dos limiares² — velocidades visualmente imperceptíveis
        const snapLinear  = linThresh2  * 0.01;
        const snapAngular = angThresh2  * 0.01;

        for (const { body } of context.bodies.values()) {
            if (body.get<boolean>('isKinematic') || body.get<boolean>('isSleeping')) continue;
            if (body.get<boolean>('gpuSimulated')) continue; // pipeline GPU gerencia sono

            const v = body.get<vec3>('velocity');
            const w = body.get<vec3>('angularVelocity');

            // Corpos sem velocity/angularVelocity no property bag (ex: SoftBody)
            // não são gerenciados por este estágio — possuem pipeline de sono próprio.
            if (!v && !w) continue;

            const v2 = v ? (v[0] ?? 0) ** 2 + (v[1] ?? 0) ** 2 + (v[2] ?? 0) ** 2 : 0;
            const w2 = w ? (w[0] ?? 0) ** 2 + (w[1] ?? 0) ** 2 + (w[2] ?? 0) ** 2 : 0;

            // Snap-to-zero: micro-velocidades abaixo de 1% do limiar dormem imediatamente.
            // Requer timer >= 10% do sleepDelay para evitar que um primeiro frame curto
            // (dt < ~8ms) dispare o snap ainda dentro dos substeps do frame inicial,
            // antes de a gravidade ter acelerado o corpo a velocidades perceptíveis.
            const alreadyQuiet = (body.get<number>('sleepTimer') ?? 0) >= this.sleepDelay * 0.1;
            if (alreadyQuiet && v2 < snapLinear && w2 < snapAngular) {
                if (v) { v[0] = 0; v[1] = 0; v[2] = 0; }
                if (w) { w[0] = 0; w[1] = 0; w[2] = 0; }
                body.set('isSleeping', true);
                body.set('sleepTimer', 0);
                continue;
            }

            const quiet = v2 < linThresh2 && w2 < angThresh2;

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
