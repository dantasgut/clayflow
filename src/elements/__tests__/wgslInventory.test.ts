import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Spec 005 (FR-028, SC-004, research R13): todo `.wgsl` de `src/` é fonte de exatamente um módulo — importado (`?raw`)
// por um único arquivo TS. Arquivo sem importador é órfão; com dois, a fonte estaria em dois módulos.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');

function walk(dir: string, ext: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) out.push(...walk(p, ext));
        else if (entry.endsWith(ext)) out.push(p);
    }
    return out;
}

const rel = (p: string): string => relative(SRC, p).replace(/\\/g, '/');
const wgslFiles = walk(SRC, '.wgsl').map(rel);
const tsFiles = walk(SRC, '.ts')
    .filter((p) => !rel(p).includes('__tests__/') && !rel(p).startsWith('__smokes__/'))
    .map((p) => ({ rel: rel(p), src: readFileSync(p, 'utf8'), dir: dirname(p) }));

/** Arquivos TS que importam `file` por `?raw` (caminho relativo resolvido). */
function importersOf(file: string): string[] {
    return tsFiles
        .filter((ts) =>
            [...ts.src.matchAll(/from\s+'([^']+\.wgsl)\?raw'/g)].some(
                (m) => rel(join(ts.dir, m[1]!)) === file,
            ),
        )
        .map((ts) => ts.rel);
}

describe('inventário de WGSL', () => {
    it('há fontes WGSL', () => {
        expect(wgslFiles.length).toBeGreaterThan(0);
    });

    it('nenhum .wgsl órfão', () => {
        const orphans = wgslFiles.filter((f) => importersOf(f).length === 0);
        expect(orphans).toEqual([]);
    });

    it('cada .wgsl é fonte de um único arquivo de módulo', () => {
        const shared = wgslFiles
            .map((f) => ({ file: basename(f), importers: importersOf(f) }))
            .filter((x) => x.importers.length > 1);
        expect(shared).toEqual([]);
    });
});
