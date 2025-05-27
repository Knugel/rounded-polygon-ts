import { Point } from "./point";

export const DistanceEpsilon = 1e-4;
export const AngleEpsilon = 1e-6;

/**
 * Approximates whether corner at this vertex is concave or convex, based on the relationship of the
 * prev->curr/curr->next vectors.
 */
export function convex(previous: Point, current: Point, next: Point): boolean {
    // TODO: b/369320447 - This is a fast, but not reliable calculation.
    return (current.minus(previous)).clockwise(next.minus(current));
}

export function interpolate(start: number, stop: number, fraction: number): number {
    return (1 - fraction) * start + fraction * stop
}

export function directionVector(x: number, y: number) {
    const d = distance(x, y)
    return new Point(x / d, y / d)
}

export function distance(x: number, y: number) {
    return Math.sqrt(x * x + y * y)
}

export function distanceSquared(x: number, y: number) {
    return x * x + y * y;
}

export function radialToCartesian(radius: number, angleRadians: number, center: Point = new Point(0, 0)) {
    return new Point(Math.cos(angleRadians), Math.sin(angleRadians)).times(radius).plus(center);
}

export function coerceIn(value: number, min: number, max?: number): number {
    if (max === undefined) {
        // Handle single-argument case where min is actually the range object
        if (typeof min === 'object' && 'start' in min && 'endInclusive' in min) {
            const range = min as { start: number, endInclusive: number };
            return Math.max(range.start, Math.min(range.endInclusive, value));
        }
        throw new Error("Invalid arguments for coerceIn");
    }

    // Swap min and max if they're in wrong order
    const [actualMin, actualMax] = min <= max ? [min, max] : [max, min];
    return Math.max(actualMin, Math.min(actualMax, value));
}

export function positiveModulo(value: number, mod: number): number {
    return ((value % mod) + mod) % mod;
}