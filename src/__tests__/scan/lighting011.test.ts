import { describe, expect, it } from 'vitest';
import { matches, read, sourceFiles } from './scanRepo';

// Varreduras da spec 011 (T029, T042): o modelo Lambert e os pontos de direção de luz saíram; cada símbolo físico novo
// é definido uma vez; nenhum estágio de desenho conhece uma classe de luz.

describe('varreduras do sombreamento físico (spec 011)', () => {
    it('saíram o Lambert fixo e os pontos de direção de luz', () => {
        const gone =
            /\b(lambert_diffuse|lambert_lit|BRDF_AMBIENT|BRDF_DIFFUSE|scene_light_direction|scene_any_light_direction)\b/;
        const found = [...sourceFiles('.wgsl'), ...sourceFiles('.ts')].flatMap((f) =>
            matches(f, read(f), gone),
        );
        expect(found).toEqual([]);
    });

    it('cada função bsdf_*, closure_* e tonemap_* é definida uma vez', () => {
        const defs = new Map<string, string[]>();
        for (const f of sourceFiles('.wgsl')) {
            for (const m of read(f).matchAll(
                /\bfn\s+((?:bsdf|closure|tonemap)_[A-Za-z0-9_]+)\s*\(/g,
            )) {
                defs.set(m[1]!, [...(defs.get(m[1]!) ?? []), f]);
            }
        }
        const repeated = [...defs].filter(([, files]) => files.length > 1);
        expect(repeated).toEqual([]);
        expect(defs.has('closure_eval')).toBe(true);
        expect(defs.has('bsdf_d_ggx')).toBe(true);
    });

    it('nenhum estágio de desenho, sprite ou da água importa uma classe de luz', () => {
        // A sombra e as cáusticas são da luz que projeta (ShadowFlow, CausticsFlow); o desenho não conhece luz.
        const stages = [
            'presentation/flows/ForwardFlow.ts',
            'presentation/flows/ParticleFlow.ts',
            'presentation/flows/WaterFlow.ts',
            'presentation/flows/FluidFieldPassFlow.ts',
            'presentation/flows/PostFlow.ts',
            'presentation/water/shaders.ts',
            'elements/material/shaders.ts',
        ];
        const light =
            /import[^;]*\b(Light|DirectionalLight|PointLight|SpotLight|HemisphereLight)\b[^;]*from/;
        const found = stages.flatMap((f) => matches(f, read(f).replace(/\n\s*/g, ' '), light));
        expect(found).toEqual([]);
    });
});
