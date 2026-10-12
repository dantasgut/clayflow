import type { ShaderModuleSpec } from '../../core/contracts/index';
import type { StructSchema } from '../descriptors/StructSchema';
import { stripWgslComments } from './scanWgslSymbols';
import { WGSL_BUILTIN_CALLABLES } from './wgslBuiltins';
import { WgslCompositionError } from './WgslCompositionError';
import type { WgslModule } from './WgslModule';

/** Resultado da montagem de um shader a partir de um módulo de entrada. */
export interface ComposedShader {
    /** Spec do shader (congelada; o mesmo objeto para a mesma entrada — identidade e dedup da 004 preservadas). */
    readonly spec: ShaderModuleSpec;
    /** Módulos incluídos, em ordem. */
    readonly modules: readonly string[];
    /** Símbolo → dono (`módulo` ou `struct <wgslName>`). */
    readonly symbols: ReadonlyMap<string, string>;
}

const MARKER = /\{\{struct:([A-Za-z_][A-Za-z0-9_]*)\}\}/g;
const CALL = /(?<!@)\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

const composed = new WeakMap<WgslModule, ComposedShader>();

/**
 * Monta o shader do módulo de entrada: dependências em pós-ordem determinística (irmãos na ordem de `requires`), cada
 * módulo uma vez; no topo, os structs gerados dos schemas usados (com os aninhados antes), cada `wgslName` uma vez;
 * marcadores `{{struct:Nome}}` validados e removidos. Rejeita (`WgslCompositionError`): ciclo, dois módulos distintos
 * com o mesmo nome, símbolo definido em dois lugares, marcador sem schema, dois schemas distintos com o mesmo
 * `wgslName` e layouts diferentes, e chamada a função não definida. Memorizado por módulo de entrada — roda na criação
 * dos recursos de GPU, nunca por quadro.
 */
export function composeWgsl(entry: WgslModule): ComposedShader {
    const cached = composed.get(entry);
    if (cached !== undefined) return cached;

    const order = topologicalOrder(entry);
    const schemas = collectSchemas(order);
    const symbols = new Map<string, string>();
    const define = (name: string, owner: string): void => {
        const previous = symbols.get(name);
        if (previous !== undefined) {
            throw new WgslCompositionError(
                'symbol-conflict',
                `composeWgsl('${entry.name}'): símbolo '${name}' definido em ${previous} e em ${owner}`,
                [name, previous, owner],
            );
        }
        symbols.set(name, owner);
    };
    for (const s of schemas) define(s.wgslName, `struct ${s.wgslName}`);
    for (const m of order) for (const sym of m.symbols) define(sym.name, m.name);

    const parts: string[] = [];
    if (schemas.length > 0) parts.push(schemas.map((s) => s.toWGSL()).join('\n\n'));
    for (const m of order) parts.push(resolveMarkers(m, entry.name));
    const source = `${parts.join('\n\n')}\n`;
    checkReferences(source, symbols, entry.name);

    const result: ComposedShader = Object.freeze({
        spec: Object.freeze({ kind: 'shader', discriminator: `wgsl:${entry.name}`, source }),
        modules: Object.freeze(order.map((m) => m.name)),
        symbols,
    });
    composed.set(entry, result);
    return result;
}

/** Pós-ordem determinística; detecta ciclo e nomes repetidos. */
function topologicalOrder(entry: WgslModule): WgslModule[] {
    const order: WgslModule[] = [];
    const done = new Set<WgslModule>();
    const byName = new Map<string, { module: WgslModule; via: string }>();
    const visit = (m: WgslModule, path: readonly WgslModule[], via: string): void => {
        const other = byName.get(m.name);
        if (other !== undefined && other.module !== m) {
            throw new WgslCompositionError(
                'duplicate-module-name',
                `composeWgsl('${entry.name}'): dois módulos distintos chamados '${m.name}' (requeridos por ${other.via} e por ${via})`,
                [m.name, other.via, via],
            );
        }
        byName.set(m.name, { module: m, via });
        if (done.has(m)) return;
        if (path.includes(m)) {
            const cycle = [...path.slice(path.indexOf(m)), m].map((x) => x.name);
            throw new WgslCompositionError(
                'cycle',
                `composeWgsl('${entry.name}'): dependência circular ${cycle.join(' → ')}`,
                cycle,
            );
        }
        for (const dep of m.requires) visit(dep, [...path, m], m.name);
        done.add(m);
        order.push(m);
    };
    visit(entry, [], '(entrada)');
    return order;
}

/** Schemas usados pelos módulos (aninhados antes), deduplicados por `wgslName`. */
function collectSchemas(order: readonly WgslModule[]): StructSchema[] {
    const out: StructSchema[] = [];
    const byName = new Map<string, StructSchema>();
    const add = (s: StructSchema): void => {
        const previous = byName.get(s.wgslName);
        if (previous === s) return;
        if (previous !== undefined) {
            if (previous.toWGSL() === s.toWGSL()) return;
            throw new WgslCompositionError(
                'struct-conflict',
                `composeWgsl: schemas '${previous.name}' e '${s.name}' geram o struct '${s.wgslName}' com layouts diferentes`,
                [s.wgslName, previous.name, s.name],
            );
        }
        byName.set(s.wgslName, s);
        out.push(s);
    };
    for (const m of order) {
        for (const s of m.structs) {
            for (const dep of s.dependencies) add(dep);
            add(s);
        }
    }
    return out;
}

/** Nomes de struct que um módulo alcança: os seus schemas, os das dependências (transitivas) e os aninhados. */
function reachableStructs(
    m: WgslModule,
    out = new Set<string>(),
    seen = new Set<WgslModule>(),
): Set<string> {
    if (seen.has(m)) return out;
    seen.add(m);
    for (const s of m.structs) {
        out.add(s.wgslName);
        for (const dep of s.dependencies) out.add(dep.wgslName);
    }
    for (const dep of m.requires) reachableStructs(dep, out, seen);
    return out;
}

function resolveMarkers(m: WgslModule, entryName: string): string {
    if (!m.source.includes('{{struct:')) return m.source;
    const reachable = reachableStructs(m);
    return m.source.replace(MARKER, (_, name: string) => {
        if (!reachable.has(name)) {
            throw new WgslCompositionError(
                'struct-marker',
                `composeWgsl('${entryName}'): o módulo '${m.name}' marca {{struct:${name}}} sem schema com esse wgslName em structs (nem nas dependências)`,
                [name, m.name],
            );
        }
        return '';
    });
}

function checkReferences(
    source: string,
    symbols: ReadonlyMap<string, string>,
    entryName: string,
): void {
    const missing = new Set<string>();
    for (const match of stripWgslComments(source).matchAll(CALL)) {
        const name = match[1]!;
        if (!WGSL_BUILTIN_CALLABLES.has(name) && !symbols.has(name)) missing.add(name);
    }
    if (missing.size > 0) {
        const names = [...missing];
        throw new WgslCompositionError(
            'unresolved-reference',
            `composeWgsl('${entryName}'): chamada a '${names.join("', '")}' sem definição — falta um módulo em requires?`,
            names,
        );
    }
}
