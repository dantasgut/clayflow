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
 * de um pipeline próprio, nunca montados juntos), os structs de E/S de vértice locais a cada entrada e os lugares de
 * ponto de extensão com pronto e adaptador em arquivos distintos (spec 009).
 */
const ALLOWED: Readonly<Record<string, string>> = {
    vs_main: 'entrada de vértice de cada pipeline de render',
    fs_main: 'entrada de fragmento de cada pipeline de render',
    VsIn: 'entrada de vértice, local a cada pipeline de render',
    VsOut: 'saída do vértice, local a cada pipeline de render',
    camera_clip:
        'lugar da projeção do forward (spec 009): o pronto e o adaptador da função de câmera nunca entram no mesmo pipeline — bindPoints troca um pelo outro',
    material_eval:
        'lugar dos parâmetros de superfície do forward (spec 009): o pronto e o adaptador da função material — bindPoints troca um pelo outro',
    surface_tangents:
        'lugar das tangentes da superfície (spec 009): numéricas (pronto) ou analíticas — bindPoints troca uma pela outra',
    surface_jet:
        'lugar do jato da superfície (spec 010): numérico (pronto), analítico, das prontas ou do mapa com o espaço — bindPoints troca um pelo outro',
    surface_collider_first:
        'início do campo de um colisor de superfície (spec 010), dado por quem hospeda a consulta: o grupo de colliders (uniforme de contagens) ou a narrowphase do LCP (registro) — nunca no mesmo pipeline',
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
