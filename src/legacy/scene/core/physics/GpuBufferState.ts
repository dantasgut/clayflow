export enum GpuBufferState {
    Unallocated, // buffer não existe ainda
    Allocated,   // buffer existe, dados válidos
    Stale,       // buffer existe mas precisa reupload
    Destroyed,   // buffer foi liberado
}
