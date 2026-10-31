/**
 * Conteúdo da CPU de uma textura (spec 039): `data[id]` escrito pela C2 na alocação (linhas justas pelo texel do
 * formato) e, com `upload: 'always'`, a cada mutação; sem conteúdo, nada; formato sem texel conhecido, erro.
 */
import { describe, expect, it, vi } from 'vitest';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { ResourceSystem } from '../systems/ResourceSystem';
import { World } from '../world/World';
import { memoryCore } from './helpers/memoryCore';

class Picture extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor(
        private readonly format: GPUTextureFormat,
        image: ArrayBufferView | undefined,
    ) {
        super();
        this.data = image === undefined ? {} : { image };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'image',
                role: 'texture',
                textureShape: { format: this.format, width: 4, height: 2 },
            },
        ];
    }
    getPipelineDescriptors() {
        return [];
    }
}

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core } = memoryCore();
    const resources = new ResourceSystem(core, events, world);
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    return { world, resources, core, frame };
}

describe('conteúdo da CPU numa textura (spec 039)', () => {
    it('escrito na alocação, pelas linhas justas do formato', () => {
        const s = setup();
        const image = new Uint16Array(4 * 2 * 4);
        const pic = new Picture('rgba16float', image);
        s.world.insert(pic);
        const texture = s.resources.textureOf(pic, 'image');
        expect(s.core.writeTexture).toHaveBeenCalledWith(
            texture,
            image,
            { bytesPerRow: 4 * 8, rowsPerImage: 2 },
            { width: 4, height: 2 },
        );
    });

    it('reescrito na mutação; sem conteúdo nada é escrito', () => {
        const s = setup();
        const empty = new Picture('rgba8unorm', undefined);
        s.world.insert(empty);
        expect(s.core.writeTexture).not.toHaveBeenCalled();
        const pic = new Picture('rgba8unorm', new Uint8Array(32));
        s.world.insert(pic);
        vi.mocked(s.core.writeTexture).mockClear();
        pic.data.image = new Uint8Array(32).fill(7);
        s.frame();
        expect(s.core.writeTexture).toHaveBeenCalledTimes(1);
    });

    it('formato sem tamanho de texel conhecido → erro', () => {
        const s = setup();
        expect(() => {
            s.world.insert(new Picture('depth24plus', new Uint8Array(32)));
        }).toThrow(/texel/);
    });
});
