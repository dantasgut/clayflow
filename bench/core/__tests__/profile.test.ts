import { describe, expect, it } from 'vitest';
import { buildProfile, parseBrowser, parseOs, shortHash, type ProfileInput } from '../profile';

const UA_141 =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.54 Safari/537.36';
const UA_141_MINOR = UA_141.replace('141.0.7390.54', '141.0.7400.12');
const UA_142 = UA_141.replace('141.0.7390.54', '142.0.1.1');

function input(over: Partial<ProfileInput> = {}, ua = UA_141): ProfileInput {
    return {
        environment: {
            gpu: { vendor: 'apple', architecture: 'metal-3', device: 'Apple M2', description: '' },
            userAgent: ua,
            devicePixelRatio: 1,
            timestampQuery: true,
            isFallbackAdapter: false,
        },
        resolution: { width: 1280, height: 720 },
        versions: { clayflow: '0.1.0', three: '0.186.1', rapier: '0.21.0' },
        commit: 'abc1234',
        date: '2026-10-05',
        ...over,
    };
}

describe('perfil de ambiente', () => {
    it('lê navegador e SO do user agent', () => {
        expect(parseBrowser(UA_141)).toEqual({
            name: 'chrome',
            version: '141.0.7390.54',
            major: 141,
        });
        expect(parseBrowser(`${UA_141} Edg/141.0.1.2`).name).toBe('edge');
        expect(parseBrowser('curl/8').name).toBe('unknown');
        expect(parseOs(UA_141)).toBe('macos');
        expect(parseOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
        expect(parseOs('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    });

    it('profileId legível, só [a-z0-9-], com hash curto', () => {
        const p = buildProfile(input());
        expect(p.profileId).toMatch(/^[a-z0-9-]+$/);
        expect(p.profileId.startsWith('apple-apple-m2-chrome141-macos-1280x720-')).toBe(true);
        expect(p.profileId.split('-').at(-1)).toHaveLength(6);
    });

    it('versão menor do navegador não muda o id; maior e resolução mudam', () => {
        const base = buildProfile(input()).profileId;
        expect(buildProfile(input({}, UA_141_MINOR)).profileId).toBe(base);
        expect(buildProfile(input({}, UA_142)).profileId).not.toBe(base);
        expect(
            buildProfile(input({ resolution: { width: 1920, height: 1080 } })).profileId,
        ).not.toBe(base);
    });

    it('commit e data não entram no id', () => {
        const base = buildProfile(input()).profileId;
        expect(buildProfile(input({ commit: 'zzz', date: '2027-01-01' })).profileId).toBe(base);
    });

    it('shortHash é estável', () => {
        expect(shortHash('abc')).toBe(shortHash('abc'));
        expect(shortHash('abc')).not.toBe(shortHash('abd'));
        expect(shortHash('abc')).toHaveLength(6);
    });
});
