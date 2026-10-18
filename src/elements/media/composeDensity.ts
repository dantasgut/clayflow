import type { CompositeFunction } from '../../scene/contracts/ExtensionFunction';
import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';

const composed = new Map<string, WgslModule>();

/** O `switch` das funções de densidade da cena (índice k + 1 → `functions[k]`; 0 = homogêneo). */
export function composeDensityFunctions(functions: readonly CompositeFunction[]): WgslModule {
    const key = functions.map((f) => f.module.name).join('+');
    let m = composed.get(key);
    if (m === undefined) {
        m = wgslModule({
            name: `fog_density_at_${functions.map((f) => f.module.name).join('_')}`,
            requires: functions.map((f) => f.module),
            source: [
                '// Funções de densidade dos volumes (gerado; spec 033, R12).',
                'fn fog_density_at(index: u32, p: vec3f, time: f32, slot: u32) -> f32 {',
                '    switch (index) {',
                ...functions.map(
                    (f, k) =>
                        `        case ${k + 1}u: { return ${f.functionName}(p, time, ${f.loaderName}(slot)); }`,
                ),
                '        default: { return 1.0; }',
                '    }',
                '}',
            ].join('\n'),
        });
        composed.set(key, m);
    }
    return m;
}
