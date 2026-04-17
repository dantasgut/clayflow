/**
 * WgslComposer — utilitário de composição de módulos WGSL.
 *
 * Combina blocos de código WGSL (strings exportadas pelos módulos wgsl/)
 * num único string pronto para ser compilado via ComputeManager.createComputePipeline.
 *
 * Deduplicação por identidade de string: se o mesmo bloco for incluído mais
 * de uma vez (ex: quat importado por dois kernels distintos), ele aparece
 * apenas uma vez no shader final — sem redeclaração de funções/structs.
 */
export class WgslComposer {
    /**
     * Concatena blocos WGSL em ordem, eliminando duplicatas por conteúdo.
     *
     * @param blocks - Blocos WGSL a compor (math, structs, kernels).
     * @returns       String WGSL completa pronta para compilação.
     */
    static compose(...blocks: string[]): string {
        const seen  = new Set<string>();
        const parts: string[] = [];

        for (const block of blocks) {
            if (block && !seen.has(block)) {
                seen.add(block);
                parts.push(block);
            }
        }

        return parts.join('\n\n');
    }
}
