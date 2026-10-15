import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import type { ScenePointEntry } from '../../scene/shaders/WgslPoint';

const combined = new Map<string, WgslModule>();

/**
 * Composição das funções `space` da cena (spec 009): `space_map` aplica as funções em sequência (ordem de inserção);
 * `space_normal` leva a normal pela inversa transposta da Jacobiana de cada uma — a fornecida (`space_jacobian`) ou por
 * diferenças centrais (passo 1e-3 · max(1, |x|)); Jacobiana singular (|det| < 1e-8) mantém a normal. Memorizada pelas
 * funções e slots.
 *
 * @param base Módulos que a composição exige (`linalg`).
 */
export function combineSpaceFunctions(
    entries: readonly ScenePointEntry[],
    base: readonly WgslModule[],
): WgslModule {
    const key = entries.map((e) => `${e.impl.module.name}@${e.slot}`).join('+');
    const known = combined.get(key);
    if (known !== undefined && entries.every((e) => known.requires.includes(e.impl.module)))
        return known;
    const lines: string[] = [
        '// Espaço da cena (gerado; spec 009): as funções `space` em sequência.',
    ];
    entries.forEach((e, k) => {
        const data = `${e.impl.loaderName}(space_records[${e.slot}u])`;
        lines.push(
            `fn space_one_${k}(x: vec3f, time: f32) -> vec3f {`,
            `    return ${e.impl.functionName}(x, time, ${data});`,
            '}',
        );
        const jac = e.impl.optionalName('space_jacobian');
        if (jac !== undefined) {
            lines.push(
                `fn space_jac_${k}(x: vec3f, time: f32) -> mat3x3f {`,
                `    return ${jac}(x, time, ${data});`,
                '}',
            );
        } else {
            lines.push(
                `fn space_jac_${k}(x: vec3f, time: f32) -> mat3x3f {`,
                '    let h = 1e-3 * max(1.0, length(x));',
                `    let cx = (space_one_${k}(x + vec3f(h, 0.0, 0.0), time) - space_one_${k}(x - vec3f(h, 0.0, 0.0), time)) / (2.0 * h);`,
                `    let cy = (space_one_${k}(x + vec3f(0.0, h, 0.0), time) - space_one_${k}(x - vec3f(0.0, h, 0.0), time)) / (2.0 * h);`,
                `    let cz = (space_one_${k}(x + vec3f(0.0, 0.0, h), time) - space_one_${k}(x - vec3f(0.0, 0.0, h), time)) / (2.0 * h);`,
                '    return mat3x3f(cx, cy, cz);',
                '}',
            );
        }
    });
    lines.push('fn space_map(x: vec3f, time: f32) -> vec3f {', '    var y = x;');
    entries.forEach((_, k) => lines.push(`    y = space_one_${k}(y, time);`));
    lines.push('    return y;', '}');
    lines.push(
        'fn space_normal(x: vec3f, time: f32, n: vec3f) -> vec3f {',
        '    var y = x;',
        '    var m = n;',
    );
    entries.forEach((_, k) => {
        lines.push(
            `    {`,
            `        let j = space_jac_${k}(y, time);`,
            '        if (abs(determinant(j)) > 1e-8) {',
            '            let t = mat3_transpose(mat3_inverse(j)) * m;',
            '            let l = length(t);',
            '            if (l > 1e-20) { m = t / l; }',
            '        }',
            `        y = space_one_${k}(y, time);`,
            '    }',
        );
    });
    lines.push('    return m;', '}');
    const module = wgslModule({
        name: `space_${entries.map((e) => e.impl.module.name.replace(/^space_fn_/, '')).join('_')}`,
        source: lines.join('\n'),
        requires: [...base, ...entries.map((e) => e.impl.module)],
    });
    combined.set(key, module);
    return module;
}
