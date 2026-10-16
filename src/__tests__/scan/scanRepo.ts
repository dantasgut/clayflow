import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raiz `src/`. */
export const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Arquivos de `src/` com a extensão, fora de `__tests__`, `__smokes__/fixtures` e `legacy` (caminhos relativos). */
export function sourceFiles(ext: string, options: { readonly tests?: boolean } = {}): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir)) {
            const p = join(dir, entry);
            if (statSync(p).isDirectory()) {
                if (entry === 'fixtures' || entry === 'legacy') continue;
                if (entry === '__tests__' && options.tests !== true) continue;
                walk(p);
            } else if (entry.endsWith(ext)) out.push(relative(SRC, p).replace(/\\/g, '/'));
        }
    };
    walk(SRC);
    return out;
}

/** Conteúdo de um arquivo de `src/`. */
export function read(rel: string): string {
    return readFileSync(join(SRC, rel), 'utf8');
}

/** Linhas (1-based) de `text` que casam com `pattern`, como `arquivo:linha: trecho`. */
export function matches(rel: string, text: string, pattern: RegExp): string[] {
    const out: string[] = [];
    text.split('\n').forEach((line, i) => {
        if (pattern.test(line)) out.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
    return out;
}
