import { describe, expect, it } from 'vitest';
import type { ResolvedSource } from '../../../consumers/ResolvedSource';
import type { InferredEntry } from '../../LayoutInferencer';
import { layoutEntryOf } from '../sources';

// Tipo de amostra das texturas de 32 bits por canal (spec 037, T042): não filtráveis sem a feature `float32-filterable`;
// filtráveis com ela (os históricos `full` lidos com o sampler de filtragem).

const entry = {
    binding: 0,
    name: 't',
    typeName: 'texture_2d<f32>',
    visibility: 2,
    resource: { texture: { sampleType: 'float', viewDimension: '2d', multisampled: false } },
} as unknown as InferredEntry;

const view = (format: GPUTextureFormat): ResolvedSource =>
    ({
        kind: 'textureView',
        view: { kind: 'textureview', format, source: { format } },
    }) as unknown as ResolvedSource;

describe('layoutEntryOf — float32-filterable', () => {
    it.each(['r32float', 'rg32float', 'rgba32float'] as const)(
        '%s: unfilterable-float sem a feature, float com ela',
        (format) => {
            expect(layoutEntryOf(entry, view(format), undefined)).toMatchObject({
                sampleType: 'unfilterable-float',
            });
            expect(layoutEntryOf(entry, view(format), undefined, true)).toMatchObject({
                sampleType: 'float',
            });
        },
    );

    it('16 bits é filtrável nos dois casos', () => {
        expect(layoutEntryOf(entry, view('rgba16float'), undefined)).toMatchObject({
            sampleType: 'float',
        });
    });
});
