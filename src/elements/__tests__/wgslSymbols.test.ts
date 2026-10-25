import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanWgslSymbols } from '../../scene/shaders/scanWgslSymbols';

// Spec 005 (FR-015, SC-003, research R13) e 031 (FR-003): cada `fn`, `struct`, `const` e `var` de escopo de módulo existe
// num único arquivo
// `.wgsl` — matemática compartilhada vem de um módulo em `requires`, nunca de uma cópia.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Exceções explícitas: entradas de estágio de render com o mesmo nome em pipelines distintos (cada arquivo é a entrada
 * de um pipeline próprio, nunca montados juntos), os structs de E/S de vértice locais a cada entrada e os lugares de
 * ponto de extensão com pronto e adaptador em arquivos distintos (spec 009).
 */
const ALLOWED: Readonly<Record<string, string>> = {
    vs_main: 'entrada de vértice de cada pipeline de render',
    fs_main: 'entrada de fragmento de cada pipeline de render',
    fs_motion:
        'entrada de fragmento do passe de movimento (spec 034) de cada pipeline de render — a conta é a de `camera_motion`',
    VsIn: 'entrada de vértice, local a cada pipeline de render',
    VsOut: 'saída do vértice, local a cada pipeline de render',
    camera_clip:
        'lugar da projeção do forward (spec 009): o pronto e o adaptador da função de câmera nunca entram no mesmo pipeline — bindPoints troca um pelo outro',
    material_eval:
        'lugar dos parâmetros de superfície do forward (spec 009): o pronto e o adaptador da função material — bindPoints troca um pelo outro',
    surface_tangents:
        'lugar das tangentes da superfície (spec 009): numéricas (pronto) ou analíticas — bindPoints troca uma pela outra',
    scan_count:
        'contagem da soma de prefixos (spec 031): do uniform (pronto) ou do registro SetCount — bindPoints troca uma pela outra',
    radix_count:
        'contagem da ordenação radix (spec 031): do uniform (pronto) ou do registro SetCount — bindPoints troca uma pela outra',
    compact_count:
        'contagem da compactação (spec 031): do uniform (pronto) ou do registro SetCount — bindPoints troca uma pela outra',
    reduce_count:
        'contagem da redução (spec 031): do uniform (pronto) ou do registro SetCount — bindPoints troca uma pela outra',
    compact_keep:
        'predicado da compactação (spec 031): cada consumidor de `Compaction` define o seu (nós set.compact e set.distributeOnMesh), um por kernel montado',
    compact_value:
        'valor compactado (spec 031): cada consumidor de `Compaction` define o seu (nós set.compact e set.distributeOnMesh), um por kernel montado',
    temporal_filter_source_size:
        'fonte do filtro de sinal traçado (spec 034): a pronta (sem sinal) ou a de quem produz o sinal (a refração) — bindPoints troca uma pela outra',
    temporal_filter_source_valid:
        'fonte do filtro de sinal traçado (spec 034): a pronta (sem sinal) ou a de quem produz o sinal (a refração) — bindPoints troca uma pela outra',
    temporal_filter_source_signal:
        'fonte do filtro de sinal traçado (spec 034): a pronta (sem sinal) ou a de quem produz o sinal (a refração) — bindPoints troca uma pela outra',
    temporal_filter_source_guide:
        'fonte do filtro de sinal traçado (spec 034): a pronta (sem sinal) ou a de quem produz o sinal (a refração) — bindPoints troca uma pela outra',
    temporal_filter_source_albedo:
        'fonte do filtro de sinal traçado (spec 034): a pronta (sem sinal) ou a de quem produz o sinal (a refração) — bindPoints troca uma pela outra',
    temporal_filter_source_previous_point:
        'fonte do filtro de sinal traçado (spec 034): a pronta (sem sinal) ou a de quem produz o sinal (a refração) — bindPoints troca uma pela outra',
    temporal_filter_source_footprint:
        'fonte do filtro de sinal traçado (spec 034): a pronta (sem sinal) ou a de quem produz o sinal (a refração) — bindPoints troca uma pela outra',
    temporal_filter_source_change:
        'fonte do filtro de sinal traçado (spec 034): a pronta (sem sinal) ou a de quem produz o sinal (a refração) — bindPoints troca uma pela outra',
    soft_energy_source_terms:
        'fonte da energia dos corpos moles (spec 037): a pronta (sem partículas) ou a de cada algoritmo (XPBD com as arestas, nós, MPM) — bindPoints troca uma pela outra',
    surface_jet:
        'lugar do jato da superfície (spec 010): numérico (pronto), analítico, das prontas ou do mapa com o espaço — bindPoints troca um pelo outro',
};

function wgslFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) out.push(...wgslFiles(p));
        else if (entry.endsWith('.wgsl')) out.push(p);
    }
    return out;
}

describe('símbolos WGSL definidos uma vez', () => {
    it('nenhum fn/struct/const em mais de um arquivo', () => {
        const where = new Map<string, string[]>();
        for (const file of wgslFiles(SRC)) {
            const rel = relative(SRC, file).replace(/\\/g, '/');
            for (const symbol of scanWgslSymbols(readFileSync(file, 'utf8'))) {
                // Variáveis de módulo também (spec 031): recursos são declarados uma vez em TypeScript, e as de
                // workgroup/privadas são de um kernel só.
                if (
                    symbol.kind !== 'fn'
                    && symbol.kind !== 'struct'
                    && symbol.kind !== 'const'
                    && symbol.kind !== 'var'
                )
                    continue;
                const key = `${symbol.kind} ${symbol.name}`;
                where.set(key, [...(where.get(key) ?? []), rel]);
            }
        }
        const duplicated = [...where.entries()]
            .filter(
                ([key, files]) =>
                    files.length > 1 && !Object.hasOwn(ALLOWED, key.slice(key.indexOf(' ') + 1)),
            )
            .map(([key, files]) => `${key}: ${files.join(', ')}`);
        expect(duplicated).toEqual([]);
    });
});
