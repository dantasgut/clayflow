import type { quat } from 'gl-matrix';

/**
 * Utilitários puramente estáticos para operações com quaternions.
 *
 * Todos os métodos operam in-place para evitar alocações no hot path da simulação.
 * O formato assumido é gl-matrix XYZW: `[x, y, z, w]`.
 *
 * Usado pelos estágios PBD (`PBDPredictStage`, `PBDSolveStage`, `PBDVelocityRecoveryStage`)
 * em vez de duplicar a lógica inline em cada arquivo.
 */
export class QuaternionUtils {
    private constructor() {}

    /**
     * Normaliza o quaternion in-place.
     * No-op se o comprimento for menor que `1e-6` (evita divisão por zero).
     *
     * @param q - Quaternion a normalizar (modificado in-place).
     */
    public static normalizeInPlace(q: quat): void {
        const len = Math.sqrt(
            (q[0] ?? 0) ** 2 + (q[1] ?? 0) ** 2 +
            (q[2] ?? 0) ** 2 + (q[3] ?? 0) ** 2,
        );
        if (len > 1e-6) {
            q[0] = (q[0] ?? 0) / len;
            q[1] = (q[1] ?? 0) / len;
            q[2] = (q[2] ?? 0) / len;
            q[3] = (q[3] ?? 0) / len;
        }
    }

    /**
     * Integra rotação via velocidade angular pré-escalada.
     *
     * Fórmula: `q += [wx·qw + wy·qz − wz·qy,
     *                  wy·qw + wz·qx − wx·qz,
     *                  wz·qw + wx·qy − wy·qx,
     *                  −wx·qx − wy·qy − wz·qz]`
     * seguida de normalização.
     *
     * O chamador é responsável por pré-escalar os componentes:
     * `wx = ω.x * 0.5 * dt`, etc.
     *
     * @param q  - Quaternion a integrar (modificado in-place).
     * @param wx - Componente x da velocidade angular pré-escalada (ω.x × 0.5 × dt).
     * @param wy - Componente y da velocidade angular pré-escalada (ω.y × 0.5 × dt).
     * @param wz - Componente z da velocidade angular pré-escalada (ω.z × 0.5 × dt).
     */
    public static integrateOmega(q: quat, wx: number, wy: number, wz: number): void {
        const qx = q[0] ?? 0;
        const qy = q[1] ?? 0;
        const qz = q[2] ?? 0;
        const qw = q[3] ?? 1;
        q[0] = qx + (wx * qw + wy * qz - wz * qy);
        q[1] = qy + (wy * qw + wz * qx - wx * qz);
        q[2] = qz + (wz * qw + wx * qy - wy * qx);
        q[3] = qw + (-wx * qx - wy * qy - wz * qz);
        QuaternionUtils.normalizeInPlace(q);
    }

    /**
     * Aplica correção angular ao quaternion via derivada de quaternion:
     *   `q += 0.5 · [ox, oy, oz, 0] ⊗ q`  → normaliza.
     *
     * Onde `[ox, oy, oz, 0]` é o quaternion puro formado pelo vetor de correção.
     * A escala temporal já está embutida em Δλ via IA⁻¹ — sem fator dt aqui.
     *
     * Usado por `PBDSolveStage` para aplicar a correção de rotação resultante
     * da projeção de constraint XPBD.
     *
     * @param q  - Quaternion a corrigir (modificado in-place).
     * @param ox - Componente x do vetor de correção angular.
     * @param oy - Componente y do vetor de correção angular.
     * @param oz - Componente z do vetor de correção angular.
     */
    public static applyAngularDelta(q: quat, ox: number, oy: number, oz: number): void {
        const qx = q[0] ?? 0;
        const qy = q[1] ?? 0;
        const qz = q[2] ?? 0;
        const qw = q[3] ?? 1;
        q[0] = qx + 0.5 * (ox * qw + oy * qz - oz * qy);
        q[1] = qy + 0.5 * (oy * qw + oz * qx - ox * qz);
        q[2] = qz + 0.5 * (oz * qw + ox * qy - oy * qx);
        q[3] = qw + 0.5 * (-ox * qx - oy * qy - oz * qz);
        QuaternionUtils.normalizeInPlace(q);
    }

    /**
     * Deriva a velocidade angular ω a partir da diferença entre dois quaternions.
     *
     * Calcula `Δq = q_new ⊗ conj(q_old)`, depois `ω = sign(Δq.w) · 2 · Δq.xyz / dt`.
     * O sinal de `Δq.w` garante o caminho mais curto na esfera de quaternions (evita flip de 360°).
     *
     * Retorna uma tupla `[wx, wy, wz]` sem alocar array — adequado para hot paths.
     *
     * @param qNewX - Componente x do quaternion novo.
     * @param qNewY - Componente y do quaternion novo.
     * @param qNewZ - Componente z do quaternion novo.
     * @param qNewW - Componente w do quaternion novo.
     * @param qOldX - Componente x do quaternion antigo.
     * @param qOldY - Componente y do quaternion antigo.
     * @param qOldZ - Componente z do quaternion antigo.
     * @param qOldW - Componente w do quaternion antigo.
     * @param dt    - Intervalo de tempo (segundos), deve ser positivo.
     * @returns Tupla `[wx, wy, wz]` com a velocidade angular derivada.
     */
    public static deltaOmega(
        qNewX: number, qNewY: number, qNewZ: number, qNewW: number,
        qOldX: number, qOldY: number, qOldZ: number, qOldW: number,
        dt: number,
    ): [number, number, number] {
        // Δq = q_new ⊗ conj(q_old),  conj([x,y,z,w]) = [−x,−y,−z,w]
        const dqx =  qNewW * (-qOldX) + qNewX * qOldW  + qNewY * (-qOldZ) - qNewZ * (-qOldY);
        const dqy =  qNewW * (-qOldY) - qNewX * (-qOldZ) + qNewY * qOldW  + qNewZ * (-qOldX);
        const dqz =  qNewW * (-qOldZ) + qNewX * (-qOldY) - qNewY * (-qOldX) + qNewZ * qOldW;
        const dqw =  qNewW * qOldW    + qNewX * qOldX    + qNewY * qOldY    + qNewZ * qOldZ;
        // ω = 2 · Δq.xyz / dt  (sinal de dqw para o caminho curto)
        const sign = dqw >= 0 ? 1 : -1;
        const inv2dt = sign * 2 / dt;
        return [dqx * inv2dt, dqy * inv2dt, dqz * inv2dt];
    }
}
