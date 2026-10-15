import { describe, expect, it } from 'vitest';
import { CATALOG, CatalogError, findScene, validateCatalog } from '../catalog';
import { isUnsupported, type SceneDefinition } from '../types';

const load = () => Promise.resolve({ setup: () => undefined });
const scene = (over: Partial<SceneDefinition> = {}): SceneDefinition => ({
    id: 'ok-scene',
    title: 't',
    description: 'd',
    phase: 'F0',
    seed: 1,
    camera: { position: [0, 0, 1], target: [0, 0, 0], fovDeg: 60 },
    variants: [{ id: 'a', params: {} }],
    implementations: { clayflow: load, three: load },
    ...over,
});

describe('catálogo real', () => {
    it('as 5 cenas da F0 e a de partículas da F2 (com as variantes de água da 017 e de coesão da 030) a de funções da 009 nas instâncias, o terreno da 010 nas partículas e a de superfícies da 010, 19 variantes', () => {
        expect(CATALOG.map((s) => s.id)).toEqual([
            'instances',
            'unique-objects',
            'point-lights',
            'skinned-characters',
            'rigid-bodies',
            'particles',
            'surfaces',
        ]);
        expect(CATALOG.reduce((n, s) => n + s.variants.length, 0)).toBe(19);
        expect(findScene('instances')?.variants.map((v) => v.id)).toEqual([
            '10k',
            '100k',
            '1m',
            '10k-moving',
            '10k-functions',
        ]);
        expect(findScene('particles')?.variants.map((v) => v.id)).toEqual([
            '4k',
            '64k',
            '4k-water',
            '64k-water',
            '4k-cohesion',
            '64k-cohesion',
            '64k-terrain',
        ]);
        expect(findScene('surfaces')?.variants.map((v) => v.id)).toEqual([
            'wave-uniform',
            'wave-adaptive',
        ]);
    });

    it('não suportados declarados com motivo e fase', () => {
        const pl = findScene('point-lights')?.implementations.clayflow;
        const sk = findScene('skinned-characters')?.implementations.clayflow;
        expect(pl !== undefined && isUnsupported(pl) ? pl.until : undefined).toBe('F4');
        expect(sk !== undefined && isUnsupported(sk) ? sk.until : undefined).toBe('F8');
    });
});

describe('validateCatalog', () => {
    it('aceita definições válidas', () => {
        expect(validateCatalog([scene()])).toHaveLength(1);
    });

    it.each([
        ['id não kebab-case', [scene({ id: 'Bad_Id' })], /kebab-case/],
        ['id duplicado', [scene(), scene()], /duplicado/],
        ['sem variantes', [scene({ variants: [] })], /variante/],
        [
            'variante duplicada',
            [
                scene({
                    variants: [
                        { id: 'a', params: {} },
                        { id: 'a', params: {} },
                    ],
                }),
            ],
            /duplicada/,
        ],
        ['engine ausente', [scene({ implementations: { clayflow: load } as never })], /three/],
        [
            'unsupported sem motivo',
            [scene({ implementations: { clayflow: { unsupported: ' ' }, three: load } })],
            /motivo/,
        ],
        ['fase ausente', [scene({ phase: '' })], /fase/],
        ['semente não inteira', [scene({ seed: 1.5 })], /semente/],
    ])('rejeita %s apontando a cena', (_name, scenes, message) => {
        expect(() => validateCatalog(scenes)).toThrow(CatalogError);
        expect(() => validateCatalog(scenes)).toThrow(message);
    });
});
