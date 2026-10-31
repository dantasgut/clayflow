/**
 * A composição do traçado (spec 039, T105): nenhuma função `material` dentro dos kernels que traçam (o material nos
 * acertos é da onda, `hitShade`), e todo laço com teto (a regra contra o travamento da GPU: laço sem orçamento total é
 * proibido) — os `loop` são a travessia da hierarquia com o orçamento `RAY_MAX_VISITS`; os `for` têm o limite numa
 * constante, num número, ou num dado de tamanho máximo conhecido (a folha da hierarquia, o passo de grade, as listas de
 * tamanho fixo), listados aqui.
 */
import { describe, expect, it } from 'vitest';
import { composeWgsl } from '../../../../scene/shaders/composeWgsl';
import { causticsTrace } from '../../caustics/shaders';
import { refractionCamera, refractionChain, refractionQueue } from '../shaders';

const KERNELS = {
    refractionChain,
    refractionCamera,
    refractionQueue,
    causticsTrace,
} as const;

/**
 * Limites de `for` que vêm do dado mas têm máximo conhecido: a folha da hierarquia (`leafSize`), o passo de grade
 * (`j < n` com o passo do despacho), as listas de tamanho fixo (os meios, os vistos pela câmera, os alvos, as luzes, as
 * tentativas da emissão, as instâncias, o bloco da cadeia).
 */
const BOUNDED_BY_DATA = new Set([
    'p < end',
    'i < count',
    'j < n',
    'i < block',
    'j < count',
    'k < instances',
    'j < targets',
    'l < lightCount',
    'k < tries',
    'i < seen_count',
    'i < inside.count',
]);

const sourceOf = (name: keyof typeof KERNELS): string => composeWgsl(KERNELS[name]).spec.source;

describe('composição do traçado (spec 039)', () => {
    for (const name of Object.keys(KERNELS) as (keyof typeof KERNELS)[]) {
        it(`${name}: nenhuma função material no traçado`, () => {
            expect(sourceOf(name)).not.toMatch(/\bmaterial_fn_|\bray_hit_material\(/);
        });

        it(`${name}: todo laço com teto`, () => {
            const src = sourceOf(name);
            // `loop`: só a travessia com o orçamento de visitas na primeira linha.
            for (const m of src.matchAll(/\bloop\s*\{\s*([^\n]*)/g))
                expect(m[1]).toMatch(/visits >= RAY_MAX_VISITS/);
            // `while`: só a ordenação por inserção dos meios (limitada pela pilha de tamanho fixo).
            for (const m of src.matchAll(/\bwhile\s*\(([^)]*)/g))
                expect(m[1]).toMatch(/^j > 0u &&/);
            for (const m of src.matchAll(/\bfor\s*\([^;]*;([^;]*);/g)) {
                const cond = m[1]!.trim();
                const constant = /[<>]=?\s*(?:[A-Z][A-Z0-9_]*|\d+u?)\b/.test(cond);
                expect(
                    constant || BOUNDED_BY_DATA.has(cond),
                    `laço sem teto conhecido: for (…; ${cond}; …)`,
                ).toBe(true);
            }
        });
    }
});
