// Alocação atômica com excedente (research R10): cada pedido recebe a próxima posição de uma lista compactada ou,
// sem espaço, ATOMIC_ALLOC_FULL — e o pedido recusado é contado em `overflow` (nunca escreve fora da lista). O struct
// `AtomicAllocCounter` é gerado do schema; quem usa zera o contador antes de cada passe de alocação.

const ATOMIC_ALLOC_FULL: u32 = 0xFFFFFFFFu;

fn atomic_alloc(counter: ptr<storage, AtomicAllocCounter, read_write>, capacity: u32) -> u32 {
    let k = atomicAdd(&(*counter).count, 1u);
    if (k >= capacity) {
        atomicAdd(&(*counter).overflow, 1u);
        return ATOMIC_ALLOC_FULL;
    }
    return k;
}
