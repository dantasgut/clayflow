/**
 * Cache de impulsos acumulados para warm-starting do `SequentialImpulseResolver`.
 *
 * Mantém dois snapshots:
 * - **`prevFrame`** — impulsos do frame anterior, fonte de warm-start.
 * - **`currentFrame`** — impulsos acumulados no frame atual, rotacionado para `prevFrame` no próximo `beginFrame()`.
 *
 * O ciclo de vida é controlado por `beginFrame()` chamado uma vez por frame pelo `PhysicsWorld`,
 * antes do loop de substeps. Isso garante que o warm-start seja aplicado apenas no primeiro
 * substep de cada frame (controlado externamente no resolver).
 *
 * Cada entrada armazena `[λN, λTx, λTy, λTz]` — impulso normal e três componentes do impulso tangencial.
 */
export class ContactCache {
    private prevFrame    = new Map<string, [number, number, number, number]>();
    private currentFrame = new Map<string, [number, number, number, number]>();

    /**
     * Rotaciona os snapshots: `currentFrame` torna-se `prevFrame` e `currentFrame` é limpo.
     * Deve ser chamado uma vez por frame, antes do loop de substeps.
     */
    public beginFrame(): void {
        const tmp        = this.prevFrame;
        this.prevFrame   = this.currentFrame;
        this.currentFrame = tmp;
        this.currentFrame.clear();
    }

    /**
     * Recupera os impulsos acumulados do frame anterior para uma chave de contato.
     *
     * @param key - Chave gerada por `ContactKeyBuilder`.
     * @returns Tupla `[λN, λTx, λTy, λTz]` ou `undefined` se não houver entrada prévia.
     */
    public getPrev(key: string): [number, number, number, number] | undefined {
        return this.prevFrame.get(key);
    }

    /**
     * Registra os impulsos acumulados do frame atual para uma chave de contato.
     *
     * @param key     - Chave gerada por `ContactKeyBuilder`.
     * @param impulses - Tupla `[λN, λTx, λTy, λTz]` dos impulsos acumulados.
     */
    public set(key: string, impulses: [number, number, number, number]): void {
        this.currentFrame.set(key, impulses);
    }

    /**
     * Limpa ambos os snapshots.
     * Usar ao desconectar uma cena ou resetar a simulação.
     */
    public reset(): void {
        this.prevFrame.clear();
        this.currentFrame.clear();
    }
}
