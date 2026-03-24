/**
 * Correção de penetração por Baumgarte posicional — stateless.
 *
 * Calcula a profundidade de correção e as frações de posição a aplicar
 * em cada corpo de um par de colisão, sem manter estado interno.
 *
 * A correção é aplicada diretamente às posições (fora do loop de impulsos de velocidade)
 * para evitar injeção de energia cinética artificial via bias de velocidade,
 * que cresceria com `1/dt` em substeps pequenos.
 *
 * Fórmula da profundidade de correção:
 * ```
 * correctionDepth = max(depth - slop, 0) × factor
 * ```
 *
 * A fração de cada corpo é proporcional à sua massa inversa relativa:
 * ```
 * scaleA = invMassA / (invMassA + invMassB)
 * scaleB = invMassB / (invMassA + invMassB)
 * ```
 */
export class BaumgarteCorrector {
    /**
     * @param factor - Fração da penetração a corrigir por substep. Default: `0.4` (40%).
     * @param slop   - Zona morta mínima de penetração (metros). Penetrações menores são ignoradas.
     *                 Default: `0.005` (5 mm).
     */
    constructor(
        private readonly factor: number = 0.4,
        private readonly slop:   number = 0.005,
    ) {}

    /**
     * Calcula a profundidade de correção a aplicar.
     *
     * @param depth - Profundidade de penetração (metros), positiva = penetrando.
     * @returns Profundidade a corrigir após remover o slop e escalar pelo fator.
     */
    public correctionDepth(depth: number): number {
        return Math.max(depth - this.slop, 0) * this.factor;
    }

    /**
     * Fração da correção a aplicar ao corpo A.
     *
     * @param invMassA   - Massa inversa do corpo A (`1/mA`); zero para cinemáticos.
     * @param invSumMass - Soma das massas inversas (`invMassA + invMassB`).
     * @returns Escala `invMassA / invSumMass`, ou zero se `invSumMass <= 0`.
     */
    public scaleA(invMassA: number, invSumMass: number): number {
        return invSumMass > 0 ? invMassA / invSumMass : 0;
    }

    /**
     * Fração da correção a aplicar ao corpo B.
     *
     * @param invMassB   - Massa inversa do corpo B (`1/mB`); zero para cinemáticos.
     * @param invSumMass - Soma das massas inversas (`invMassA + invMassB`).
     * @returns Escala `invMassB / invSumMass`, ou zero se `invSumMass <= 0`.
     */
    public scaleB(invMassB: number, invSumMass: number): number {
        return invSumMass > 0 ? invMassB / invSumMass : 0;
    }
}
