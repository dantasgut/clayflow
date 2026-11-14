/**
 * O piso dos perfis de referência (spec 037 R7): o mínimo comum, nos limites de desenho do motor, dos adaptadores
 * gravados pelo smoke `adapterLimits` (`src/__smokes__/fixtures/adapter-limits-*.json`). Dado de teste, não do motor
 * (que pede o máximo que o adaptador informa): o `deviceFloor` o usa como teto (`DeviceOptions.limitsCeiling`) para
 * emular o dispositivo mais modesto dos perfis.
 */
export const REFERENCE_FLOOR: Readonly<Record<string, number>> = Object.freeze({
    // `adapter-limits-apple-metal-3.json` (2026-10-23); a RTX 4090 (`nvidia-lovelace`) entra no mínimo quando gravada.
    maxStorageBuffersPerShaderStage: 10,
    maxStorageTexturesPerShaderStage: 8,
    maxColorAttachments: 8,
    maxColorAttachmentBytesPerSample: 128,
});
