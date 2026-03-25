import { mat4, vec3 }               from 'gl-matrix';
import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { SoftBody }            from '../../SoftBody';
import type { Transform }           from '../../../../scene/math/Transform';

/**
 * Estágio de colisão do pipeline XPBD SoftBody — Partícula vs. qualquer SDFCollider.
 *
 * Para cada collider com SDF registrado em `context.colliders` (PlaneShape,
 * BoxShape, SphereShape, SDFCollider genérico), testa cada partícula e resolve
 * a penetração via projeção de posição e reflexão de velocidade.
 *
 * Para `PlaneShape`, o SDF é o semiespaço infinito (`p·n - offset`): partículas
 * em qualquer ponto abaixo do plano são corrigidas para a superfície, independente
 * dos limites `halfWidth`/`halfDepth`. Esses limites são verificados apenas pelos
 * algoritmos de colisão de corpo rígido (PlaneBoxCollision, PlaneSphereCollision).
 *
 * Resolução por partícula:
 *   lp = invWorldMatrix · p_pred           (posição no espaço local do collider)
 *   d  = collider.sdf(lp)                  (distância assinalada — negativo = dentro)
 *   Se d < 0:
 *     n̂ = ∇SDF(lp) transformado para mundo  (normal de saída)
 *     p_pred += −d · n̂                      (projeção)
 *     vₙ = v · n̂
 *     Se vₙ < 0: v −= (1+e)·vₙ·n̂           (restituição)
 *
 * O gradiente do SDF é calculado por diferenças finitas no espaço local
 * e transformado para mundo via a parte de rotação (mat3) da worldMatrix.
 * Partículas fixadas (w = 0) são ignoradas.
 */

const EPS = 1e-4;

interface ShapeEntry {
    readonly invWm:    mat4;
    readonly wm:       mat4;
    readonly sdf:      (p: vec3) => number;
    readonly collider: object;
}

export class SoftBodyCollisionStage implements PhysicsStage {
    constructor(private readonly restitution: number = 0.05) {}

    public execute(context: PhysicsStageContext, dt: number): void {
        // Coleta todos os colliders que expõem SDF
        const shapes: ShapeEntry[] = [];
        for (const { collider, entity } of context.colliders.values()) {
            if (!collider.sdf) continue;
            const transform = entity.getComponent<Transform>('Transform');
            if (!transform) continue;
            const wm    = transform.worldMatrix;
            const invWm = mat4.invert(mat4.create(), wm);
            if (!invWm) continue;
            const sdf = collider.sdf.bind(collider);
            shapes.push({ invWm, wm, sdf, collider });
        }
        if (shapes.length === 0) return;

        for (const { body } of context.bodies.values()) {
            if (body.physicType !== 'SoftBody') continue;
            if (body.get<boolean>('gpuSimulated')) continue; // pipeline GPU ativo — skip CPU
            const sb     = body as unknown as SoftBody;
            const radius = body.get<number>('particleRadius') ?? 0.05;

            for (const p of sb.particles) {
                if (p.w <= 0) continue;

                const wp = vec3.fromValues(p.px, p.py, p.pz);

                for (const shape of shapes) {
                    const { invWm, wm, sdf } = shape;
                    // Posição prevista no espaço local do collider
                    const lp = vec3.transformMat4(vec3.create(), wp, invWm);
                    const d  = sdf(lp);
                    if (d >= radius) continue;   // fora do alcance — sem contato

                    // Gradiente do SDF no espaço local (diferenças finitas)
                    const gx = sdf(vec3.fromValues(lp[0]! + EPS, lp[1]!,       lp[2]!      )) - d;
                    const gy = sdf(vec3.fromValues(lp[0]!,       lp[1]! + EPS, lp[2]!      )) - d;
                    const gz = sdf(vec3.fromValues(lp[0]!,       lp[1]!,       lp[2]! + EPS)) - d;

                    // Transforma gradiente local → normal no espaço mundo (parte mat3 da worldMatrix)
                    // gl-matrix mat4 é column-major: col0=[0..2], col1=[4..6], col2=[8..10]
                    let wnx = wm[0]! * gx + wm[4]! * gy + wm[8]!  * gz;
                    let wny = wm[1]! * gx + wm[5]! * gy + wm[9]!  * gz;
                    let wnz = wm[2]! * gx + wm[6]! * gy + wm[10]! * gz;
                    const len = Math.sqrt(wnx * wnx + wny * wny + wnz * wnz) || 1;
                    wnx /= len; wny /= len; wnz /= len;

                    // Projeta posição prevista — estratégia em dois passos para evitar
                    // explosão de velocidade no derivador XPBD (v = (p_pred − p_old)/dt):
                    //
                    //  Passo 1 — Correção posicional sem geração de velocidade:
                    //    Move AMBOS p_old e p_pred pela correção completa.
                    //    Resultado: (p_pred − p_old)/dt não muda → velocidade preservada.
                    //
                    //  Passo 2 — Restituição via delta em p_pred:
                    //    Se a partícula estava se aproximando (vn < 0), adiciona impulso
                    //    de restituição apenas em p_pred: Δp_pred = dt · (1+e) · |vn| · n̂
                    //    Resultado: v_nova = v_velha + (1+e)·|vn| → reflexão correta.
                    //
                    const correction = radius - d;

                    // Passo 1: move ambas as posições pela correção completa
                    p.x  += correction * wnx;
                    p.y  += correction * wny;
                    p.z  += correction * wnz;
                    p.px += correction * wnx;
                    p.py += correction * wny;
                    p.pz += correction * wnz;

                    // Passo 2: restituição (usa p.vx/vy/vz = velocidade pré-predict)
                    const vn = p.vx * wnx + p.vy * wny + p.vz * wnz;
                    if (vn < 0) {
                        const dv = -(1.0 + this.restitution) * vn; // impulso ≥ 0
                        p.px += dt * dv * wnx;
                        p.py += dt * dv * wny;
                        p.pz += dt * dv * wnz;
                    }
                }
            }
        }
    }
}
