import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanWgslSymbols } from '../../scene/shaders/scanWgslSymbols';

// Spec 005 (FR-015, SC-003, research R13): cada `fn`, `struct` e `const` de escopo de módulo existe num único arquivo
// `.wgsl` — matemática compartilhada vem de um módulo em `requires`, nunca de uma cópia.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Exceções explícitas: entradas de estágio de render com o mesmo nome em pipelines distintos (cada arquivo é a entrada
 * de um pipeline próprio, nunca montados juntos) e os structs de E/S de vértice locais a cada entrada.
 */
const ALLOWED: Readonly<Record<string, string>> = {
    vs_main: 'entrada de vértice de cada pipeline de render',
    fs_main: 'entrada de fragmento de cada pipeline de render',
    VsIn: 'entrada de vértice, local a cada pipeline de render',
    VsOut: 'saída do vértice, local a cada pipeline de render',
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
                if (symbol.kind !== 'fn' && symbol.kind !== 'struct' && symbol.kind !== 'const')
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
