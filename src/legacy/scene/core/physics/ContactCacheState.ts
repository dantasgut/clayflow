// Exclusivo SI (CPU ContactCache)
export enum ContactCacheState {
    Miss,    // contato novo, sem histórico
    Hit,     // encontrado no cache do frame anterior
    Expired, // cache expirou (corpo removido ou feature mudou)
}
