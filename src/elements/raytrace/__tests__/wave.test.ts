/**
 * A onda dos acertos (spec 039, R1–R5): o material nos acertos fora dos laços de traçado — um kernel por função
 * `material` (uma só no kernel, sem laço), o das constantes como substituto, a separação por classe e o layout dos
 * registros e dos fechamentos.
 */
import { describe, expect, it } from 'vitest';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { MaterialFunction } from '../../extension/MaterialFunction';
import { ClosureSchema } from '../../material/pbr/ClosureSchema';
import type { RayMaterialFunction } from '../RayScene';
import { HIT_SHADE_ENTRY, RAY_WAVE_CLASS, hitShade, hitShadeConstants } from '../hitShade';
import {
    RayWaveEntrySchema,
    RayWaveHitSchema,
    rayWave,
    rayWaveArgsWords,
    rayWaveBins,
    rayWaveClassArgsOffset,
    rayWaveCountWords,
    rayWaveScatterArgsOffset,
} from '../wave/shaders';

const fn = (body: string): RayMaterialFunction => {
    const f = new MaterialFunction({
        code: `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n    return ${body};\n}`,
    });
    return { ...f.composite!, returnsClosure: f.returnsClosure };
};

const count = (source: string, pattern: RegExp): number => source.match(pattern)?.length ?? 0;

describe('onda dos acertos (spec 039)', () => {
    it('o kernel de material de uma função: só ela, uma vez, sem laço; a classe por constante', () => {
        const f = fn('closure_diffuse(m.albedo.rgb, 0.0)');
        const source = composeWgsl(hitShade(f)).spec.source;
        expect(count(source, /\bmaterial_fn_[0-9a-f]+\(s, m,/g)).toBe(1);
        expect(source).toContain(`fn ${HIT_SHADE_ENTRY}(`);
        expect(source).toContain(`override ${RAY_WAVE_CLASS}: u32`);
        const entry = source.slice(source.indexOf(`fn ${HIT_SHADE_ENTRY}(`));
        expect(entry).not.toMatch(/\b(for|loop|while|switch)\b/);
        expect(entry).toContain('ray_wave_entries[i].closure = closure_sanitize(');
    });

    it('funções diferentes: kernels diferentes; a mesma função: o mesmo kernel', () => {
        const a = fn('closure_diffuse(m.albedo.rgb, 0.0)');
        const b = fn('closure_emission(vec3f(4.0), 1.0)');
        expect(composeWgsl(hitShade(a)).spec.source).not.toBe(composeWgsl(hitShade(b)).spec.source);
        expect(composeWgsl(hitShade(a)).spec.source).toBe(
            composeWgsl(hitShade(fn('closure_diffuse(m.albedo.rgb, 0.0)'))).spec.source,
        );
    });

    it('o das constantes: nenhuma função material, o fechamento do StandardMaterial', () => {
        const source = composeWgsl(hitShadeConstants).spec.source;
        expect(source).not.toMatch(/\bmaterial_fn_/);
        expect(source).toContain(
            'closure_from_params(SurfaceParams(m.albedo, m.roughness, m.metallic',
        );
    });

    it('gravar na onda: sem função material; as constantes avaliadas por quem traça', () => {
        const source = composeWgsl(rayWave).spec.source;
        expect(source).not.toMatch(/\bmaterial_fn_|\bray_hit_material\(/);
        expect(source).toContain('fn ray_wave_put_surface(');
    });

    it('a separação: zerar, faixas e argumentos numa invocação, espalhar por classe', () => {
        const source = composeWgsl(rayWaveBins).spec.source;
        for (const entry of ['ray_wave_reset_main', 'ray_wave_scan_main', 'ray_wave_scatter_main'])
            expect(source).toContain(`fn ${entry}(`);
        expect(rayWaveCountWords(3)).toBe(7);
        expect(rayWaveArgsWords(3)).toBe(12);
        expect(rayWaveClassArgsOffset(2)).toBe(24);
        expect(rayWaveScatterArgsOffset(3)).toBe(36);
    });

    it('layout: o registro em 96 B e o fechamento pelo schema', () => {
        expect(RayWaveHitSchema.stride).toBe(96);
        // O fechamento em storage: 67 floats com o alinhamento de 16 B dos vec3f.
        expect(ClosureSchema.stride).toBe(368);
        expect(RayWaveEntrySchema.stride).toBe(464);
    });
});
