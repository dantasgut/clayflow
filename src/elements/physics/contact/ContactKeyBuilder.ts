/**
 * Gera chaves de cache estáveis para contatos de colisão.
 *
 * Dois modos de chave:
 * - **Feature-based** (quando `featureId` está definido): `${entityIdA}:${entityIdB}:v${featureId}`.
 *   Estável entre frames sem depender de posição — adequado para contatos vértice-face.
 * - **Grade posicional** (fallback): grade com resolução `gridScale` (padrão 20 células/metro = 5 cm/célula).
 *   Tolera pequenas variações de posição inter-frame no mesmo contato.
 *
 * Usado por `SequentialImpulseResolver` para indexar o warm-start cache e o friction anchor cache.
 */
export class ContactKeyBuilder {
    /**
     * @param gridScale - Número de células por metro. Default: `1 / 0.05 = 20` (grade de 5 cm).
     */
    constructor(private readonly gridScale: number = 1 / 0.05) {}

    /**
     * Constrói a chave de cache para um ponto de contato.
     *
     * @param entityIdA - ID da entidade A.
     * @param entityIdB - ID da entidade B.
     * @param cpx       - Posição x do ponto de contato (mundo).
     * @param cpy       - Posição y do ponto de contato (mundo).
     * @param cpz       - Posição z do ponto de contato (mundo).
     * @param featureId - Índice de feature opcional (ex: índice de vértice da caixa).
     *                    Quando presente, produz chave feature-based (mais estável).
     * @returns Chave de string única para o ponto de contato.
     */
    public build(
        entityIdA: number | string,
        entityIdB: number | string,
        cpx: number,
        cpy: number,
        cpz: number,
        featureId?: number,
    ): string {
        if (featureId !== undefined) {
            return `${entityIdA}:${entityIdB}:v${featureId}`;
        }
        return `${entityIdA}:${entityIdB}:${Math.round(cpx * this.gridScale)}:${Math.round(cpy * this.gridScale)}:${Math.round(cpz * this.gridScale)}`;
    }
}
