import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import type { ScenePointEntry } from '../../scene/shaders/WgslPoint';

const combined = new Map<string, WgslModule>();

/**
 * Composição das funções `field` da cena (spec 009): `field_accel` = campos prontos + cada função do usuário com os
 * parâmetros do seu registro (slot no pool `FieldFnRecord`); resultado não finito de uma função não entra na soma.
 * Memorizada pelas funções e slots.
 *
 * @param base Módulos que a composição exige (tipos, campos prontos, `finite` e o recurso `field_records`).
 */
export function combineFieldFunctions(
    entries: readonly ScenePointEntry[],
    base: readonly WgslModule[],
): WgslModule {
    const key = entries.map((e) => `${e.impl.module.name}@${e.slot}`).join('+');
    const known = combined.get(key);
    if (known !== undefined && entries.every((e) => known.requires.includes(e.impl.module)))
        return known;
    const terms = entries.map(
        (e) =>
            `    a += field_finite(${e.impl.functionName}(x, v, time, body, ${e.impl.loaderName}(field_records[${e.slot}u])));`,
    );
    const module = wgslModule({
        name: `field_accel_${entries.map((e) => e.impl.module.name.replace(/^field_fn_/, '')).join('_')}`,
        source: [
            '// Campos da cena (gerado; spec 009): os prontos e as funções `field` do usuário.',
            'fn field_finite(f: vec3f) -> vec3f {',
            '    return select(vec3f(0.0), f, finite3(f));',
            '}',
            'fn field_accel(x: vec3f, v: vec3f, time: f32, body: FieldBody) -> vec3f {',
            '    var a = field_builtin(x, v, time, body);',
            ...terms,
            '    return a;',
            '}',
        ].join('\n'),
        requires: [...base, ...entries.map((e) => e.impl.module)],
    });
    combined.set(key, module);
    return module;
}
