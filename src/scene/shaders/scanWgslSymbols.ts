/** Tipo de declaração WGSL de nível superior. */
export type WgslSymbolKind = 'fn' | 'struct' | 'const' | 'override' | 'alias' | 'var';

/** Símbolo declarado no escopo de módulo de um fonte WGSL. */
export interface WgslSymbol {
    /** Identificador declarado. */
    readonly name: string;
    /** Tipo de declaração. */
    readonly kind: WgslSymbolKind;
}

const DECLARATIONS: ReadonlySet<string> = new Set([
    'fn',
    'struct',
    'const',
    'override',
    'alias',
    'var',
]);
const TOKEN = /[A-Za-z_][A-Za-z0-9_]*|[{}<>]|[^\sA-Za-z_{}<>]/g;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Remove comentários de linha (`//`) e de bloco (`/* *\/`, aninhados, como no WGSL), trocando-os por espaço para
 * preservar as quebras de linha.
 */
export function stripWgslComments(source: string): string {
    let out = '';
    let depth = 0;
    for (let i = 0; i < source.length; i++) {
        const c = source[i]!;
        const next = source[i + 1];
        if (depth === 0 && c === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') i++;
            out += '\n';
            continue;
        }
        if (c === '/' && next === '*') {
            depth++;
            i++;
            out += ' ';
            continue;
        }
        if (depth > 0 && c === '*' && next === '/') {
            depth--;
            i++;
            out += ' ';
            continue;
        }
        if (depth > 0) {
            if (c === '\n') out += '\n';
            continue;
        }
        out += c;
    }
    return out;
}

/**
 * Símbolos declarados no escopo de módulo (`fn`, `struct`, `const`, `override`, `alias`, `var` — inclusive com
 * template `var<storage, read_write>` e atributos como `@group(0) @binding(1)` antes da declaração), na ordem do
 * fonte. Não é um parser completo: declarações dentro de corpos de função e de structs são ignoradas pela profundidade
 * de chaves, e diretivas (`enable`, `requires`, `diagnostic`) não declaram símbolos.
 */
export function scanWgslSymbols(source: string): WgslSymbol[] {
    const tokens = stripWgslComments(source).match(TOKEN) ?? [];
    const symbols: WgslSymbol[] = [];
    let depth = 0;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i]!;
        if (t === '{') {
            depth++;
            continue;
        }
        if (t === '}') {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (depth !== 0 || !DECLARATIONS.has(t)) continue;
        // Um identificador precedido de '@' é atributo (ex.: `@const` não existe, mas `@must_use`), não declaração.
        if (tokens[i - 1] === '@') continue;
        let j = i + 1;
        if (t === 'var' && tokens[j] === '<') {
            let angle = 0;
            for (; j < tokens.length; j++) {
                if (tokens[j] === '<') angle++;
                else if (tokens[j] === '>' && --angle === 0) break;
            }
            j++;
        }
        const name = tokens[j];
        if (name !== undefined && IDENT.test(name)) {
            symbols.push({ name, kind: t as WgslSymbolKind });
            i = j;
        }
    }
    return symbols;
}
