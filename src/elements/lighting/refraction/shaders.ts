import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import refractionQueueSource from '../../gpu/wgsl/refraction/refraction_queue.wgsl?raw';
import { REFRACTION_QUEUE_FORMAT, REFRACTION_REQUEST_VALID } from './Refraction';

// Módulos da refração traçada (spec 034, R1): os alvos do `Refraction` ligados pelo `RefractionFlow` (privados dele) e
// os kernels da fila e do traçado.

/** Recursos privados do estágio: o pedido por pixel (leitura), a fila (escrita) e a contagem dela. */
export const refractionResources = Object.freeze({
    request: wgslResource({
        name: 'refraction_request',
        binding: { texture: { sample: 'u32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    queueOut: wgslResource({
        name: 'refraction_queue_out',
        binding: { storageTexture: { format: REFRACTION_QUEUE_FORMAT, access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    queueCount: wgslResource({
        name: 'refraction_queue_count',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'frame',
        provider: 'private',
    }),
});

/** Kernel da fila compacta dos pixels com pedido. */
export const refractionQueue = wgslModule({
    name: 'refraction_queue',
    source: refractionQueueSource,
    requires: [
        WORKGROUP_SIZE.module,
        REFRACTION_REQUEST_VALID.module,
        refractionResources.request,
        refractionResources.queueOut,
        refractionResources.queueCount,
    ],
});
