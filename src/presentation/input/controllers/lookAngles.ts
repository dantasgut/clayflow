/** Direção para onde olha um controller de primeira pessoa a partir de guinada e arfagem (−Z com yaw = pitch = 0). */
export function forwardOf(yaw: number, pitch: number): [number, number, number] {
    return [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}

/** Lado direito correspondente (no plano horizontal). */
export function rightOf(yaw: number): [number, number, number] {
    return [Math.cos(yaw), 0, Math.sin(yaw)];
}
