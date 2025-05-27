import { Point } from "./point";
import { convex, directionVector, distance, DistanceEpsilon, interpolate } from "./utils";

/**
 * This class holds the anchor and control point data for a single cubic Bézier curve, with anchor
 * points ([anchor0X], [anchor0Y]) and ([anchor1X], [anchor1Y]) at either end and control points
 * ([control0X], [control0Y]) and ([control1X], [control1Y]) determining the slope of the curve
 * between the anchor points.
 */
export class Cubic {
    public get anchor0X(): number {
        return this.points[0];
    }

    public get anchor0Y(): number {
        return this.points[1];
    }

    public get control0X(): number {
        return this.points[2];
    }

    public get control0Y(): number {
        return this.points[3];
    }

    public get control1X(): number {
        return this.points[4];
    }

    public get control1Y(): number {
        return this.points[5];
    }

    public get anchor1X(): number {
        return this.points[6];
    }

    public get anchor1Y(): number {
        return this.points[7];
    }

    constructor(public readonly points: number[]) {
    }

    public static create(anchor0: Point, control0: Point, control1: Point, anchor1: Point) {
        return new Cubic([anchor0.x, anchor0.y, control0.x, control0.y, control1.x, control1.y, anchor1.x, anchor1.y]);
    }

    /**
     * Returns a point on the curve for parameter t, representing the proportional distance along
     * the curve between its starting point at anchor0 and ending point at anchor1.
     *
     * @param t The distance along the curve between the anchor points, where 0 is at anchor0 and 1
     *   is at anchor1
     */
    public pointOnCurve(t: number): Point {
        const u = 1 - t
        return new Point(
            this.anchor0X * (u * u * u) +
            this.control0X * (3 * t * u * u) +
            this.control1X * (3 * t * t * u) +
            this.anchor1X * (t * t * t),
            this.anchor0Y * (u * u * u) +
            this.control0Y * (3 * t * u * u) +
            this.control1Y * (3 * t * t * u) +
            this.anchor1Y * (t * t * t),
        )
    }

    public zeroLength() {
        return Math.abs(this.anchor0X - this.anchor1X) < DistanceEpsilon && Math.abs(this.anchor0Y - this.anchor1Y) < DistanceEpsilon
    }

    public convexTo(next: Cubic): boolean {
        const prevVertex = new Point(this.anchor0X, this.anchor0Y)
        const currVertex = new Point(this.anchor1X, this.anchor1Y)
        const nextVertex = new Point(next.anchor1X, next.anchor1Y)
        return convex(prevVertex, currVertex, nextVertex)
    }

    public zeroIsh(value: number) {
        return Math.abs(value) < DistanceEpsilon;
    }

    /**
     * This function returns the true bounds of this curve, filling [bounds] with the axis-aligned
     * bounding box values for left, top, right, and bottom, in that order.
     */
    public calculateBounds(bounds: number[], approximate: boolean = false) {
        // A curve might be of zero-length, with both anchors co-lated.
        // Just return the point itself.
        if (this.zeroLength()) {
            bounds[0] = this.anchor0X
            bounds[1] = this.anchor0Y
            bounds[2] = this.anchor0X
            bounds[3] = this.anchor0Y
            return
        }

        let minX = Math.min(this.anchor0X, this.anchor1X)
        let minY = Math.min(this.anchor0Y, this.anchor1Y)
        let maxX = Math.max(this.anchor0X, this.anchor1X)
        let maxY = Math.max(this.anchor0Y, this.anchor1Y)

        if (approximate) {
            // Approximate bounds use the bounding box of all anchors and controls
            bounds[0] = Math.min(minX, Math.min(this.control0X, this.control1X))
            bounds[1] = Math.min(minY, Math.min(this.control0Y, this.control1Y))
            bounds[2] = Math.max(maxX, Math.max(this.control0X, this.control1X))
            bounds[3] = Math.max(maxY, Math.max(this.control0Y, this.control1Y))
            return
        }

        // Find the derivative, which is a quadratic Bezier. Then we can solve for t using
        // the quadratic formula
        const xa = -this.anchor0X + 3 * this.control0X - 3 * this.control1X + this.anchor1X
        const xb = 2 * this.anchor0X - 4 * this.control0X + 2 * this.control1X
        const xc = -this.anchor0X + this.control0X

        if (this.zeroIsh(xa)) {
            // Try Muller's method instead; it can find a single root when a is 0
            if (xb != 0) {
                const t = 2 * xc / (-2 * xb)
                if (t >= 0 && t <= 1) {
                    const it = this.pointOnCurve(t).x;
                    if (it < minX) minX = it
                    if (it > maxX) maxX = it
                }
            }
        } else {
            const xs = xb * xb - 4 * xa * xc
            if (xs >= 0) {
                const t1 = (-xb + Math.sqrt(xs)) / (2 * xa)
                if (t1 >= 0 && t1 <= 1) {
                    const it = this.pointOnCurve(t1).x;
                    if (it < minX) minX = it
                    if (it > maxX) maxX = it
                }

                const t2 = (-xb - Math.sqrt(xs)) / (2 * xa)
                if (t2 >= 0 && t2 <= 1) {
                    const it = this.pointOnCurve(t2).x;
                    if (it < minX) minX = it
                    if (it > maxX) maxX = it
                }
            }
        }

        // Repeat the above for y coordinate
        const ya = -this.anchor0Y + 3 * this.control0Y - 3 * this.control1Y + this.anchor1Y
        const yb = 2 * this.anchor0Y - 4 * this.control0Y + 2 * this.control1Y
        const yc = -this.anchor0Y + this.control0Y

        if (this.zeroIsh(ya)) {
            if (yb != 0) {
                const t = 2 * yc / (-2 * yb)
                if (t >= 0 && t <= 1) {
                    const it = this.pointOnCurve(t).y;
                    if (it < minY) minY = it
                    if (it > maxY) maxY = it
                }
            }
        } else {
            const ys = yb * yb - 4 * ya * yc
            if (ys >= 0) {
                const t1 = (-yb + Math.sqrt(ys)) / (2 * ya)
                if (t1 >= 0 && t1 <= 1) {
                    const it = this.pointOnCurve(t1).y;
                    if (it < minY) minY = it
                    if (it > maxY) maxY = it
                }

                const t2 = (-yb - Math.sqrt(ys)) / (2 * ya)
                if (2 >= 0 && t2 <= 1) {
                    const it = this.pointOnCurve(t2).y;
                    if (it < minY) minY = it
                    if (it > maxY) maxY = it
                }
            }
        }
        bounds[0] = minX
        bounds[1] = minY
        bounds[2] = maxX
        bounds[3] = maxY
    }

    public split(t: number): { a: Cubic, b: Cubic } {
        const u = 1 - t
        const pointOnCurve = this.pointOnCurve(t)
        return {
            a: new Cubic(
                [
                    this.anchor0X,
                    this.anchor0Y,
                    this.anchor0X * u + this.control0X * t,
                    this.anchor0Y * u + this.control0Y * t,
                    this.anchor0X * (u * u) + this.control0X * (2 * u * t) + this.control1X * (t * t),
                    this.anchor0Y * (u * u) + this.control0Y * (2 * u * t) + this.control1Y * (t * t),
                    pointOnCurve.x,
                    pointOnCurve.y
                ]
            ),
            b: new Cubic(
                // TODO: should calculate once and share the result
                [
                    pointOnCurve.x,
                    pointOnCurve.y,
                    this.control0X * (u * u) + this.control1X * (2 * u * t) + this.anchor1X * (t * t),
                    this.control0Y * (u * u) + this.control1Y * (2 * u * t) + this.anchor1Y * (t * t),
                    this.control1X * u + this.anchor1X * t,
                    this.control1Y * u + this.anchor1Y * t,
                    this.anchor1X,
                    this.anchor1Y
                ]
            )
        }
    }

    public reverse() {
        return new Cubic([this.anchor1X, this.anchor1Y, this.control1X, this.control1Y, this.control0X, this.control0Y, this.anchor0X, this.anchor0Y]);
    }

    public plus(other: Cubic): Cubic {
        return new Cubic(other.points.map((_, index) => this.points[index] + other.points[index]));
    }

    public times(x: number): Cubic {
        return new Cubic(this.points.map(v => v * x));
    }

    public div(x: number) {
        return this.times(1 / x);
    }

    public equals(other: Cubic) {
        return this.points.every((p, i) => other.points[i] === p)
    }

    public transformed(f: (x: number, y: number) => Point) {
        const newCubic = new MutableCubic([...this.points]);
        newCubic.transform(f);
        return newCubic;
    }

    public static straightLine(x0: number, y0: number, x1: number, y1: number) {
        return new Cubic([
            x0,
            y0,
            interpolate(x0, x1, 1 / 3),
            interpolate(y0, y1, 1 / 3),
            interpolate(x0, x1, 2 / 3),
            interpolate(y0, y1, 2 / 3),
            x1,
            y1,
        ])
    }

    public static circularArc(centerX: number,
                              centerY: number,
                              x0: number,
                              y0: number,
                              x1: number,
                              y1: number) {
        const p0d = directionVector(x0 - centerX, y0 - centerY)
        const p1d = directionVector(x1 - centerX, y1 - centerY)
        const rotatedP0 = p0d.rotate90()
        const rotatedP1 = p1d.rotate90()
        const clockwise = rotatedP0.dotProductScalar(x1 - centerX, y1 - centerY) >= 0
        const cosa = p0d.dotProduct(p1d)
        if (cosa > 0.999)
            return Cubic.straightLine(x0, y0, x1, y1);

        const k = distance(x0 - centerX, y0 - centerY) * 4 / 3 * (Math.sqrt(2 * (1 - cosa)) - Math.sqrt(1 - cosa * cosa)) / (1 - cosa) * (clockwise ? 1 : -1);
        return new Cubic([
                x0,
                y0,
                x0 + rotatedP0.x * k,
                y0 + rotatedP0.y * k,
                x1 - rotatedP1.x * k,
                y1 - rotatedP1.y * k,
                x1,
                y1,
            ]
        )
    }

    public static empty(x0: number, y0: number) {
        return new Cubic([x0, y0, x0, y0, x0, y0, x0, y0]);
    }
}

export class MutableCubic extends Cubic {
    public transform(f: (x: number, y: number) => Point) {
        this.transformOnePoint(f, 0);
        this.transformOnePoint(f, 2);
        this.transformOnePoint(f, 4);
        this.transformOnePoint(f, 6);
    }

    public interpolate(c1: Cubic, c2: Cubic, progress: number) {
        for(let i = 0; i < 8; i++) {
            this.points[i] = interpolate(c1.points[i], c2.points[i], progress);
        }
    }

    private transformOnePoint(f: (x: number, y: number) => Point, ix: number) {
        const result = f(this.points[ix], this.points[ix + 1]);
        this.points[ix] = result.x;
        this.points[ix + 1] = result.y;
    }
}