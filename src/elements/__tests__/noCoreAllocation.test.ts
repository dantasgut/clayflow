import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Spec 039 (FR-019, SC-007): nenhum Flow nem auxiliar de C3/C4 cria, escreve, destrói ou lê objetos de GPU pelo core —
// todo dado é descritor de um Resource, alocado e escrito pela C2 (Princípio III). A regra de lint impede o mesmo no
// editor; este teste conta os sites no gate.

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

/** Código sem comentários (uma menção num comentário não é uma chamada). */
function code(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('zero alocação de GPU fora da C2 (spec 039)', () => {
    it('nenhum core.create/createAsync/write/writeTexture/destroy/readback em src/elements, src/presentation e src/platform', () => {
        const sites = ['elements', 'presentation', 'platform']
            .flatMap((d) => tsFiles(join(SRC, d)))
            .map((p) => ({
                rel: relative(SRC, p).replace(/\\/g, '/'),
                src: code(readFileSync(p, 'utf8')),
            }))
            .filter((f) => !f.rel.includes('__tests__/'))
            .flatMap((f) =>
                [
                    ...f.src.matchAll(
                        /\bcore\.(create|createAsync|write|writeTexture|destroy|readback)\s*[<(]/g,
                    ),
                ].map((m) => `${f.rel}: core.${m[1]}`),
            );
        expect(sites).toEqual([]);
    });
});
