import type { BindingLayoutEntry } from '../../../core/contracts/index';
import { WgslCompositionError } from '../../shaders/WgslCompositionError';

const STAGES: readonly [number, string][] = [
    [1, 'vertex'],
    [2, 'fragment'],
    [4, 'compute'],
];

function kindOf(e: BindingLayoutEntry): string | undefined {
    if (e.kind === 'buffer') {
        return e.type === 'uniform'
            ? 'maxUniformBuffersPerShaderStage'
            : 'maxStorageBuffersPerShaderStage';
    }
    if (e.kind === 'sampler') return 'maxSamplersPerShaderStage';
    if (e.kind === 'texture') return 'maxSampledTexturesPerShaderStage';
    if (e.kind === 'storage-texture') return 'maxStorageTexturesPerShaderStage';
    return undefined;
}

/**
 * Confere o layout de um pipeline contra os limites do dispositivo (spec 031, R6): grupos, ligações por grupo e, por
 * estágio, buffers de storage e uniform, amostradores, texturas amostradas e de storage. Limite ausente em `limits` não
 * é conferido.
 *
 * @throws WgslCompositionError `limit-exceeded` nomeando o pipeline, o limite, o valor e o máximo.
 */
export function checkLayoutLimits(
    label: string,
    groups: readonly (readonly BindingLayoutEntry[])[],
    limits: Readonly<Record<string, number>>,
    names?: readonly (readonly string[])[],
): void {
    const fail = (limit: string, value: number, max: number, where = '', detail = ''): never => {
        throw new WgslCompositionError(
            'limit-exceeded',
            `${label}: ${limit} excedido${where} — ${value} > ${max}${detail}`,
            [label, limit, String(value), String(max)],
        );
    };
    const maxGroups = limits.maxBindGroups;
    if (maxGroups !== undefined && groups.length > maxGroups)
        fail('maxBindGroups', groups.length, maxGroups);
    const perGroup = limits.maxBindingsPerBindGroup;
    groups.forEach((g, i) => {
        for (const e of g) {
            if (perGroup !== undefined && e.binding >= perGroup)
                fail('maxBindingsPerBindGroup', e.binding + 1, perGroup, ` no grupo ${i}`);
        }
    });
    for (const [bit, stage] of STAGES) {
        const counts = new Map<string, number>();
        const which = new Map<string, string[]>();
        groups.forEach((g, gi) => {
            g.forEach((e, ei) => {
                if ((e.visibility & bit) === 0) return;
                const k = kindOf(e);
                if (k === undefined) return;
                counts.set(k, (counts.get(k) ?? 0) + 1);
                const list = which.get(k) ?? [];
                list.push(names?.[gi]?.[ei] ?? `@group(${gi}) @binding(${e.binding})`);
                which.set(k, list);
            });
        });
        for (const [k, n] of counts) {
            const max = limits[k];
            // Os recursos contados vão na mensagem: o que cortar para caber.
            if (max !== undefined && n > max)
                fail(k, n, max, ` no estágio ${stage}`, ` (${which.get(k)!.join(', ')})`);
        }
    }
}
