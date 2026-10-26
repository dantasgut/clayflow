import { WgslCompositionError } from './WgslCompositionError';
import { wgslModule, type WgslModule } from './WgslModule';

/** O que `bindPoints` usa de um ponto (`WgslPoint`): o nome e o módulo pronto que a implementação substitui. */
export interface BindablePoint {
    /** Nome do ponto. */
    readonly name: string;
    /** Módulo pronto. */
    readonly ready: WgslModule;
}

const memo = new WeakMap<WgslModule, Map<string, WgslModule>>();
/** As trocas aplicadas em cada módulo devolvido (as do módulo de entrada, se ele mesmo já vinha trocado, e as novas). */
const applied = new WeakMap<WgslModule, ReadonlyMap<BindablePoint, WgslModule>>();

/**
 * As trocas que `bindPoints` aplicou no módulo `m` (vazio se ele não saiu de `bindPoints`): ponto → implementação. Quem
 * troca outros pontos depois no mesmo shader (a C2, com as contribuições da cena) as aplica também dentro dos módulos
 * que acrescenta — uma contribuição que chama o ponto usa a implementação que o shader já tem, não o pronto.
 */
export function boundImplementations(m: WgslModule): ReadonlyMap<BindablePoint, WgslModule> {
    return applied.get(m) ?? new Map();
}

/**
 * Módulo de entrada com a implementação de cada ponto trocada (spec 009): a árvore de `requires` de `entry` é
 * reescrita com `impls.get(ponto)` no lugar de `ponto.ready`; módulos sem o pronto na subárvore são reaproveitados.
 * O resultado se chama `entry@impl[+impl…]` e é memorizado por `(entry, impls)` — o mesmo par devolve o mesmo
 * módulo, e portanto o mesmo shader montado. Sem impls, devolve `entry`. Lança `WgslCompositionError`
 * (`point-missing`) se algum ponto não está na árvore de `entry`.
 */
export function bindPoints(
    entry: WgslModule,
    impls: ReadonlyMap<BindablePoint, WgslModule>,
): WgslModule {
    if (impls.size === 0) return entry;
    const pairs = [...impls].sort((a, b) => (a[0].name < b[0].name ? -1 : 1));
    const key = pairs.map(([p, m]) => `${p.name}=${m.name}`).join('+');
    let byKey = memo.get(entry);
    if (byKey === undefined) memo.set(entry, (byKey = new Map()));
    const cached = byKey.get(key);
    // Nomes de módulo identificam a implementação (hash do código); a identidade confirma.
    if (cached !== undefined && pairs.every(([, m]) => contains(cached, m))) return cached;

    const swap = new Map<WgslModule, WgslModule>(pairs.map(([p, m]) => [p.ready, m]));
    const found = new Set<WgslModule>();
    const rewritten = new Map<WgslModule, WgslModule>();
    const visit = (m: WgslModule): WgslModule => {
        const direct = swap.get(m);
        if (direct !== undefined) {
            found.add(m);
            // A implementação também pode chamar outros pontos (spec 011: o laço das luzes chama a sombra e a água
            // por luz): os prontos dentro dela são trocados também — menos o deste ponto, que ela substitui.
            return swap.has(direct) ? direct : visit(direct);
        }
        const done = rewritten.get(m);
        if (done !== undefined) return done;
        const requires = m.requires.map(visit);
        const same = requires.every((r, k) => r === m.requires[k]);
        const out = same
            ? m
            : wgslModule({
                  name:
                      m === entry ? `${m.name}@${pairs.map(([, i]) => i.name).join('+')}` : m.name,
                  source: m.source,
                  requires,
                  structs: m.structs,
              });
        rewritten.set(m, out);
        return out;
    };
    const result = visit(entry);
    const missing = pairs.filter(([p]) => !found.has(p.ready)).map(([p]) => p.name);
    if (missing.length > 0) {
        throw new WgslCompositionError(
            'point-missing',
            `bindPoints('${entry.name}'): ponto(s) ${missing.join(', ')} fora da árvore do módulo`,
            [entry.name, ...missing],
        );
    }
    byKey.set(key, result);
    applied.set(result, new Map([...boundImplementations(entry), ...pairs]));
    return result;
}

function contains(root: WgslModule, target: WgslModule): boolean {
    const seen = new Set<WgslModule>();
    const walk = (m: WgslModule): boolean => {
        if (m === target) return true;
        if (seen.has(m)) return false;
        seen.add(m);
        return m.requires.some(walk);
    };
    return walk(root);
}
