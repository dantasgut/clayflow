/**
 * A luz nos acertos da onda fora dos kernels que somam (spec 034, T078): a luz direta — as luzes, a estrutura de raios e
 * os contribuintes da luz (as cáusticas, a transmissão das sombras, a luz indireta) — num kernel próprio, e quem soma os
 * rebatimentos (as sondas da GI) ou segue o caminho (a cadeia da refração) só lê o que ele gravou: cada kernel cabe no
 * que o adaptador concede por estágio com os contribuintes da cena.
 */
import { describe, expect, it } from 'vitest';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import type { WgslModule } from '../../../scene/shaders/WgslModule';
import { LayoutInferencer } from '../../../scene/systems/LayoutInferencer';
import { refractionChain } from '../refraction/shaders';
import { giProbeTrace, giScreenTrace, giWaveDirect } from '../shaders';

const bindings = (module: WgslModule, entry: string): string[] =>
    new LayoutInferencer()
        .infer(composeWgsl(module), [entry])
        .groups.flatMap((g) => g.entries)
        .map((e) => e.name);

/** O corpo da função `name` no WGSL composto. */
function body(module: WgslModule, name: string): string {
    const src = composeWgsl(module).spec.source;
    const start = src.indexOf(`fn ${name}(`);
    expect(start, `fn ${name}`).toBeGreaterThanOrEqual(0);
    return src.slice(start, src.indexOf('\n}\n', start));
}

const LIGHT = ['lights', 'ray_bvh', 'ray_geometry'];

describe('a luz nos acertos da onda (spec 034, T078)', () => {
    it.each([
        [giProbeTrace, 'gi_probe_trace_main'],
        [giScreenTrace, 'gi_screen_trace_main'],
    ] as const)(
        '%#: os rebatimentos não ligam as luzes nem a estrutura de raios',
        (module, entry) => {
            const names = bindings(module, entry);
            for (const n of LIGHT) expect(names).not.toContain(n);
            expect(names).toContain('gi_wave_light_read');
        },
    );

    it('a luz direta da GI liga as luzes, a estrutura e a onda', () => {
        const names = bindings(giWaveDirect, 'gi_wave_direct_main');
        for (const n of [...LIGHT, 'ray_wave_entries_in', 'gi_wave_light'])
            expect(names).toContain(n);
    });

    it('os rebatimentos da GI não leem o fechamento (os fatores vêm da luz direta)', () => {
        expect(body(giProbeTrace, 'gi_probe_trace_main')).not.toMatch(/\.closure\b/);
        expect(body(giScreenTrace, 'gi_screen_trace_main')).not.toMatch(/\.closure\b/);
    });

    it('a continuação da refração não avalia a luz do ponto opaco', () => {
        expect(body(refractionChain, 'refraction_node_at')).not.toMatch(/refraction_shade\(/);
        expect(body(refractionChain, 'refraction_chain_follow_one')).not.toMatch(
            /refraction_shade\(/,
        );
        expect(body(refractionChain, 'refraction_chain_light_one')).toMatch(/refraction_shade\(/);
    });
});
