import { wgslModule, type WgslModule } from './WgslModule';

const memo = new WeakMap<WgslModule, Map<string, WgslModule>>();

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;

/**
 * Renomeia, por token, os identificadores de `names` em `source` (fora de comentários e de acessos a membro `.x`),
 * acrescentando `suffix`. Não é substituição de texto: só identificadores inteiros que são símbolos do módulo mudam.
 */
function renameTokens(source: string, names: ReadonlySet<string>, suffix: string): string {
    let out = '';
    let i = 0;
    let depth = 0;
    while (i < source.length) {
        const c = source[i]!;
        const next = source[i + 1];
        if (depth === 0 && c === '/' && next === '/') {
            const end = source.indexOf('\n', i);
            const stop = end < 0 ? source.length : end;
            out += source.slice(i, stop);
            i = stop;
            continue;
        }
        if (c === '/' && next === '*') {
            depth++;
            out += '/*';
            i += 2;
            continue;
        }
        if (depth > 0) {
            if (c === '*' && next === '/') {
                depth--;
                out += '*/';
                i += 2;
                continue;
            }
            out += c;
            i++;
            continue;
        }
        if (IDENT_START.test(c) && (i === 0 || !IDENT_PART.test(source[i - 1]!))) {
            let j = i + 1;
            while (j < source.length && IDENT_PART.test(source[j]!)) j++;
            const word = source.slice(i, j);
            // Membro (`v.x`) não é símbolo do módulo.
            let k = i - 1;
            while (k >= 0 && (source[k] === ' ' || source[k] === '\t')) k--;
            const member = k >= 0 && source[k] === '.';
            // Campo de struct, parâmetro ou local com tipo (`nome:`) declara um nome próprio, não usa o símbolo.
            let n = j;
            while (n < source.length && (source[n] === ' ' || source[n] === '\t')) n++;
            // `const NOME: T` e `override NOME: T` declaram o próprio símbolo do módulo (renomeado).
            const before = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(
                source.slice(Math.max(0, i - 24), i),
            )?.[1];
            const declares =
                source[n] === ':'
                && source[n + 1] !== ':'
                && before !== 'const'
                && before !== 'override';
            out += !member && !declares && names.has(word) ? `${word}${suffix}` : word;
            i = j;
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

/**
 * Instância de um módulo (spec 031, R7): os símbolos de nível superior do módulo (`fn`, `struct`, `const`, `override`,
 * `alias`; variáveis não — recursos são declarados e compartilhados) recebem o sufixo, para que duas instâncias do
 * mesmo código convivam no mesmo shader (contribuintes de um ponto de cena, nós repetidos de um grafo). As
 * dependências não mudam. Memorizada por (módulo, sufixo).
 */
export function instantiateModule(module: WgslModule, suffix: string): WgslModule {
    let bySuffix = memo.get(module);
    if (bySuffix === undefined) memo.set(module, (bySuffix = new Map()));
    const known = bySuffix.get(suffix);
    if (known !== undefined) return known;
    const names = new Set(module.symbols.filter((s) => s.kind !== 'var').map((s) => s.name));
    const instance = wgslModule({
        name: `${module.name}${suffix}`,
        source: renameTokens(module.source, names, suffix),
        requires: module.requires,
        structs: module.structs,
    });
    bySuffix.set(suffix, instance);
    return instance;
}
