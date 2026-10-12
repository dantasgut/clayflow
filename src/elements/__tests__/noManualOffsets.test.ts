import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Spec 005 (FR-010, FR-011, SC-002): parâmetros e estado de GPU são empacotados pelo schema (`pack`/`packInto`/
// `PerStepUniforms.write`), nunca por índice numérico num TypedArray. Dados de vértice/índice das geometrias seguem o
// próprio caminho (`vertexLayout`) e ficam fora desta verificação.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');

function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) out.push(...tsFiles(p));
        else if (entry.endsWith('.ts')) out.push(p);
    }
    return out;
}

const files = [...tsFiles(join(SRC, 'elements')), ...tsFiles(join(SRC, 'presentation'))]
    .map((p) => ({ rel: relative(SRC, p).replace(/\\/g, '/'), src: readFileSync(p, 'utf8') }))
    .filter((f) => !f.rel.includes('__tests__/') && !f.rel.startsWith('elements/geometry/'));

describe('nenhum offset de GPU escrito à mão', () => {
    it('nenhuma escrita `f32[n] =`/`u32[n] =`/`i32[n] =` com índice literal', () => {
        const offenders = files
            .filter((f) => /\b(?:f32|u32|i32)\[\d+\]\s*=/.test(f.src))
            .map((f) => f.rel);
        expect(offenders).toEqual([]);
    });

    it('nenhum `core.write` com TypedArray montado à mão', () => {
        const offenders = files
            .filter((f) => /\.write\([^,]+,\s*new (?:Uint32|Float32|Int32)Array\(/.test(f.src))
            .map((f) => f.rel);
        expect(offenders).toEqual([]);
    });

    it('nenhum tamanho de struct como constante solta (`*_BYTE_SIZE`, `*_NODE_SIZE`, `*_BYTES`, `*_STRIDE*`)', () => {
        const offenders = files
            .filter((f) =>
                /const \w*(?:BYTE_SIZE|NODE_SIZE|_BYTES|_STRIDE\w*)\s*=\s*\d+/.test(f.src),
            )
            .map((f) => f.rel);
        expect(offenders).toEqual([]);
    });
});
