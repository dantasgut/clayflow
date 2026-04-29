// Setup globals para tests rodando fora do browser (happy-dom não tem WebGPU constants).
// Os valores correspondem ao spec WebGPU (https://www.w3.org/TR/webgpu/#typedefdef-gpubufferusageflags).

if (typeof (globalThis as { GPUBufferUsage?: unknown }).GPUBufferUsage === 'undefined') {
    (globalThis as { GPUBufferUsage: object }).GPUBufferUsage = {
        MAP_READ:      0x0001,
        MAP_WRITE:     0x0002,
        COPY_SRC:      0x0004,
        COPY_DST:      0x0008,
        INDEX:         0x0010,
        VERTEX:        0x0020,
        UNIFORM:       0x0040,
        STORAGE:       0x0080,
        INDIRECT:      0x0100,
        QUERY_RESOLVE: 0x0200,
    };
}

if (typeof (globalThis as { GPUTextureUsage?: unknown }).GPUTextureUsage === 'undefined') {
    (globalThis as { GPUTextureUsage: object }).GPUTextureUsage = {
        COPY_SRC:          0x01,
        COPY_DST:          0x02,
        TEXTURE_BINDING:   0x04,
        STORAGE_BINDING:   0x08,
        RENDER_ATTACHMENT: 0x10,
    };
}

if (typeof (globalThis as { GPUShaderStage?: unknown }).GPUShaderStage === 'undefined') {
    (globalThis as { GPUShaderStage: object }).GPUShaderStage = {
        VERTEX:   0x1,
        FRAGMENT: 0x2,
        COMPUTE:  0x4,
    };
}
