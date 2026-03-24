/**
 * Cache de âncoras de atrito para o `SequentialImpulseResolver`.
 *
 * Mantém dois snapshots:
 * - **`prevFrame`** — âncoras do frame anterior, usadas para calcular o bias de restauração.
 * - **`currentFrame`** — âncoras do frame atual, rotacionado para `prevFrame` no próximo `beginFrame()`.
 *
 * Cada entrada armazena `[cpx, cpy, cpz]` — posição do ponto de contato no momento em que
 * o atrito estático foi estabelecido. O resolver usa a âncora para gerar uma velocidade de
 * restauração que "puxa" o objeto de volta à posição de contato original, prevenindo drift
 * em superfícies inclinadas.
 *
 * O ciclo de vida espelha o de `ContactCache`: `beginFrame()` é chamado uma vez por frame.
 */
export class FrictionAnchorCache {
    private prevFrame    = new Map<string, [number, number, number]>();
    private currentFrame = new Map<string, [number, number, number]>();

    /**
     * Rotaciona os snapshots: `currentFrame` torna-se `prevFrame` e `currentFrame` é limpo.
     * Deve ser chamado uma vez por frame, antes do loop de substeps.
     */
    public beginFrame(): void {
        const tmp         = this.prevFrame;
        this.prevFrame    = this.currentFrame;
        this.currentFrame = tmp;
        this.currentFrame.clear();
    }

    /**
     * Recupera a âncora de atrito do frame anterior para uma chave de contato.
     *
     * @param key - Chave gerada por `ContactKeyBuilder`.
     * @returns Tupla `[cpx, cpy, cpz]` da posição de âncora ou `undefined` se não houver entrada.
     */
    public getPrev(key: string): [number, number, number] | undefined {
        return this.prevFrame.get(key);
    }

    /**
     * Registra a âncora de atrito do frame atual para uma chave de contato.
     *
     * @param key    - Chave gerada por `ContactKeyBuilder`.
     * @param anchor - Tupla `[cpx, cpy, cpz]` da posição de âncora.
     */
    public set(key: string, anchor: [number, number, number]): void {
        this.currentFrame.set(key, anchor);
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
