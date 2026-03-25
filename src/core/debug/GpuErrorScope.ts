/**
 * Executa `fn` dentro de um GPUDevice error scope do tipo `filter`.
 * Retorna o GPUError capturado, ou null se nenhum erro ocorreu.
 * Rethrow NÃO é responsabilidade deste helper — o chamador decide.
 */
export async function withErrorScope(
    device: GPUDevice,
    filter: GPUErrorFilter,
    fn: () => Promise<void>,
): Promise<GPUError | null> {
    device.pushErrorScope(filter);
    await fn();
    return device.popErrorScope();
}
