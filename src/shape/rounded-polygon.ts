import { Corner, Edge, type Feature } from "./feature";
import { Point } from "./point";
import type { PointTransformer } from "./point";
import { Cubic } from "./cubic";
import { convex, distance, distanceSquared, radialToCartesian } from "./utils";
import { CornerRounding } from "./corner-rounding";
import { RoundedCorner } from "./rounded-corner";

export class RoundedPolygon {
    public get centerX() {
        return this.center.x;
    }

    public get centerY() {
        return this.center.y;
    }

    public cubics: Cubic[]

    constructor(public readonly features: Feature[], public readonly center: Point) {
        this.cubics = this.buildCubicList();
    }

    public transformed(f: PointTransformer) {
        const center = this.center.transformed(f);
        return new RoundedPolygon(this.features.map(x => x.transformed(f)), center);
    }

    public normalized() {
        const bounds = this.calculateBounds()
        const width = bounds[2] - bounds[0]
        const height = bounds[3] - bounds[1]
        const side = Math.max(width, height)
        // Center the shape if bounds are not a square
        const offsetX = (side - width) / 2 - bounds[0] /* left */
        const offsetY = (side - height) / 2 - bounds[1] /* top */
        return this.transformed((x, y) => {
            return new Point((x + offsetX) / side, (y + offsetY) / side);
        });
    }

    public calculateMaxBounds(bounds: number[] = []) {
        let maxDistSquared = 0;
        for (let i = 0; i < this.cubics.length; i++) {
            const cubic = this.cubics[i]
            const anchorDistance = distanceSquared(cubic.anchor0X - this.centerX, cubic.anchor0Y - this.centerY)
            const middlePoint = cubic.pointOnCurve(.5)
            const middleDistance = distanceSquared(middlePoint.x - this.centerX, middlePoint.y - this.centerY)
            maxDistSquared = Math.max(maxDistSquared, Math.max(anchorDistance, middleDistance))
        }
        const distance = Math.sqrt(maxDistSquared)
        bounds[0] = this.centerX - distance
        bounds[1] = this.centerY - distance
        bounds[2] = this.centerX + distance
        bounds[3] = this.centerY + distance
        return bounds;
    }

    public calculateBounds(bounds: number[] = [], approximate: boolean = true) {
        let minX = Number.MAX_SAFE_INTEGER
        let minY = Number.MAX_SAFE_INTEGER
        let maxX = Number.MIN_SAFE_INTEGER
        let maxY = Number.MIN_SAFE_INTEGER
        for (let i = 0; i < this.cubics.length; i++) {
            const cubic = this.cubics[i]
            cubic.calculateBounds(bounds, approximate)
            minX = Math.min(minX, bounds[0])
            minY = Math.min(minY, bounds[1])
            maxX = Math.max(maxX, bounds[2])
            maxY = Math.max(maxY, bounds[3])
        }
        bounds[0] = minX
        bounds[1] = minY
        bounds[2] = maxX
        bounds[3] = maxY
        return bounds
    }

    private buildCubicList() {
        const result: Cubic[] = [];

        // The first/last mechanism here ensures that the final anchor point in the shape
        // exactly matches the first anchor point. There can be rendering artifacts introduced
        // by those points being slightly off, even by much less than a pixel
        let firstCubic: Cubic | null = null
        let lastCubic: Cubic | null = null
        let firstFeatureSplitStart: Cubic[] | null = null
        let firstFeatureSplitEnd: Cubic[] | null = null

        if (this.features.length > 0 && this.features[0].cubics.length == 3) {
            const centerCubic = this.features[0].cubics[1]
            const { a: start, b: end } = centerCubic.split(.5);
            firstFeatureSplitStart = [this.features[0].cubics[0], start]
            firstFeatureSplitEnd = [end, this.features[0].cubics[2]]
        }
        // iterating one past the features list size allows us to insert the initial split
        // cubic if it exists
        for (let i = 0; i <= this.features.length; i++) {
            let featureCubics;
            if (i == 0 && firstFeatureSplitEnd != null) {
                featureCubics = firstFeatureSplitEnd
            } else if (i == this.features.length) {
                if (firstFeatureSplitStart != null) {
                    featureCubics = firstFeatureSplitStart;
                } else {
                    break
                }
            } else {
                featureCubics = this.features[i].cubics
            }

            for (let j = 0; j < featureCubics.length; j++) {
                // Skip zero-length curves; they add nothing and can trigger rendering artifacts
                const cubic = featureCubics[j];
                if (!cubic.zeroLength()) {
                    if (lastCubic != null)
                        result.push(lastCubic)
                    lastCubic = cubic
                    if (firstCubic == null)
                        firstCubic = cubic
                } else {
                    if (lastCubic != null) {
                        // Dropping several zero-ish length curves in a row can lead to
                        // enough discontinuity to throw an exception later, even though the
                        // distances are quite small. Account for that by making the last
                        // cubic use the latest anchor point, always.
                        lastCubic = new Cubic([...lastCubic.points]) // Make a copy before mutating
                        lastCubic.points[6] = cubic.anchor1X
                        lastCubic.points[7] = cubic.anchor1Y
                    }
                }
            }
        }
        if (lastCubic != null && firstCubic != null) {
            result.push(
                new Cubic([
                    lastCubic.anchor0X,
                    lastCubic.anchor0Y,
                    lastCubic.control0X,
                    lastCubic.control0Y,
                    lastCubic.control1X,
                    lastCubic.control1Y,
                    firstCubic.anchor0X,
                    firstCubic.anchor0Y,
                ])
            )
        } else {
            // Empty / 0-sized polygon.
            result.push(new Cubic([this.centerX, this.centerY, this.centerX, this.centerY, this.centerX, this.centerY, this.centerX, this.centerY]))
        }

        return result;
    }

    private static calculateCenter(vertices: number[]): Point {
        let cumulativeX = 0;
        let cumulativeY = 0;
        let index = 0
        while (index < vertices.length) {
            cumulativeX += vertices[index++]
            cumulativeY += vertices[index++]
        }
        return new Point(cumulativeX / (vertices.length / 2), cumulativeY / (vertices.length / 2))
    }

    private static verticesFromNumVerts(
        numVertices: number,
        radius: number,
        centerX: number,
        centerY: number,
    ): number[] {
        const result = [];
        let arrayIndex = 0
        for (let i = 0; i < numVertices; i++) {
            const vertex = radialToCartesian(radius, (Math.PI / numVertices * 2 * i)).plus(new Point(centerX, centerY))
            result[arrayIndex++] = vertex.x
            result[arrayIndex++] = vertex.y
        }
        return result
    }

    public static fromNumVertices(numVertices: number, radius: number = 1, centerX: number = 0, centerY: number = 0, rounding: CornerRounding = CornerRounding.Unrounded, perVertexRounding: CornerRounding[] | null = null) {
        return RoundedPolygon.fromVertices(this.verticesFromNumVerts(numVertices, radius, centerX, centerY), rounding, perVertexRounding, centerX, centerY);
    }

    public static fromVertices(vertices: number[], rounding: CornerRounding = CornerRounding.Unrounded, perVertexRounding: CornerRounding[] | null = null, centerX: number = Number.MIN_SAFE_INTEGER, centerY: number = Number.MAX_SAFE_INTEGER) {
        const corners: Cubic[][] = [];
        const n = vertices.length / 2;
        const roundedCorners: RoundedCorner[] = []
        for (let i = 0; i < n; i++) {
            const vtxRounding = perVertexRounding?.[i] ?? rounding;
            const prevIndex = ((i + n - 1) % n) * 2
            const nextIndex = ((i + 1) % n) * 2
            roundedCorners.push(
                new RoundedCorner(
                    new Point(vertices[prevIndex], vertices[prevIndex + 1]),
                    new Point(vertices[i * 2], vertices[i * 2 + 1]),
                    new Point(vertices[nextIndex], vertices[nextIndex + 1]),
                    vtxRounding,
                )
            )
        }

        // For each side, check if we have enough space to do the cuts needed, and if not split
        // the available space, first for round cuts, then for smoothing if there is space left.
        // Each element in this list is a pair, that represent how much we can do of the cut for
        // the given side (side i goes from corner i to corner i+1), the elements of the pair are:
        // first is how much we can use of expectedRoundCut, second how much of expectedCut
        const cutAdjusts = Array.from({ length: n }).map((_, ix) => {
            const expectedRoundCut = roundedCorners[ix].expectedRoundCut + roundedCorners[(ix + 1) % n].expectedRoundCut
            const expectedCut = roundedCorners[ix].expectedCut + roundedCorners[(ix + 1) % n].expectedCut
            const vtxX = vertices[ix * 2]
            const vtxY = vertices[ix * 2 + 1]
            const nextVtxX = vertices[((ix + 1) % n) * 2]
            const nextVtxY = vertices[((ix + 1) % n) * 2 + 1]
            const sideSize = distance(vtxX - nextVtxX, vtxY - nextVtxY)

            // Check expectedRoundCut first, and ensure we fulfill rounding needs first for
            // both corners before using space for smoothing
            if (expectedRoundCut > sideSize) {
                // Not enough room for fully rounding, see how much we can actually do.
                return { a: sideSize / expectedRoundCut, b: 0 }
            } else if (expectedCut > sideSize) {
                // We can do full rounding, but not full smoothing.
                return { a: 1, b: (sideSize - expectedRoundCut) / (expectedCut - expectedRoundCut) }
            } else {
                // There is enough room for rounding & smoothing.
                return { a: 1, b: 1 }
            }
        });

        // Create and store list of beziers for each [potentially] rounded corner
        for (let i = 0; i < n; i++) {
            // allowedCuts[0] is for the side from the previous corner to this one,
            // allowedCuts[1] is for the side from this corner to the next one.
            const allowedCuts = [];
            for(const delta of [0, 1]) {
                const { a: roundCutRatio, b: cutRatio } = cutAdjusts[(i + n - 1 + delta) % n]
                allowedCuts.push(
                    roundedCorners[i].expectedRoundCut * roundCutRatio +
                    (roundedCorners[i].expectedCut - roundedCorners[i].expectedRoundCut) * cutRatio
                )
            }
            corners.push(
                roundedCorners[i].getCubics(allowedCuts[0], allowedCuts[1])
            )
        }

        const tempFeatures: Feature[] = [];
        for (let i = 0; i < n; i++) {
            // Note that these indices are for pairs of values (points), they need to be
            // doubled to access the xy values in the vertices float array
            const prevVtxIndex = (i + n - 1) % n
            const nextVtxIndex = (i + 1) % n
            const currVertex = new Point(vertices[i * 2], vertices[i * 2 + 1])
            const prevVertex = new Point(vertices[prevVtxIndex * 2], vertices[prevVtxIndex * 2 + 1])
            const nextVertex = new Point(vertices[nextVtxIndex * 2], vertices[nextVtxIndex * 2 + 1])
            const cnvx = convex(prevVertex, currVertex, nextVertex)
            tempFeatures.push(new Corner(corners[i], cnvx))
            tempFeatures.push(
                new Edge([                     Cubic.straightLine(
                        corners[i].at(-1)!.anchor1X,
                        corners[i].at(-1)!.anchor1Y,
                        corners[(i + 1) % n].at(0)!.anchor0X,
                        corners[(i + 1) % n].at(0)!.anchor0Y,
                    )])
            )
        }

        let center: Point;
        if (centerX == Number.MIN_SAFE_INTEGER || centerY == Number.MIN_SAFE_INTEGER) {
            center = this.calculateCenter(vertices)
        } else {
            center = new Point(centerX, centerY)
        }

        return RoundedPolygon.fromFeatures(tempFeatures, center.x, center.y);
    }

    public static fromFeatures(features: Feature[], centerX: number, centerY: number) {
        const vertices = [];
        for (const feature of features) {
            for (const cubic of feature.cubics) {
                vertices.push(cubic.anchor0X)
                vertices.push(cubic.anchor0Y)
            }
        }

        if (Number.isNaN(centerX)) {
            centerX = this.calculateCenter(vertices).x
        }
        if (Number.isNaN(centerY)) {
            centerX = this.calculateCenter(vertices).y
        }

        return new RoundedPolygon(features, new Point(centerX, centerY));
    }

    public static circle(numVertices: number = 8, radius: number = 1, centerX: number = 0, centerY: number = 0) {
        // Half of the angle between two adjacent vertices on the polygon
        const theta = Math.PI / numVertices;
        // Radius of the underlying RoundedPolygon object given the desired radius of the circle
        const polygonRadius = radius / Math.cos(theta)
        return RoundedPolygon.fromNumVertices(
            numVertices,
            radius = polygonRadius,
            centerX,
            centerY,
            new CornerRounding(radius),
        )
    }

    public static rectangle(width: number, height: number, rounding: CornerRounding = CornerRounding.Unrounded, perVertexRounding: CornerRounding[] | null = null, centerX: number, centerY: number) {
        const left = centerX - width / 2
        const top = centerY - height / 2
        const right = centerX + width / 2
        const bottom = centerY + height / 2

        return RoundedPolygon.fromVertices([right, bottom, left, bottom, left, top, right, top], rounding, perVertexRounding, centerX, centerY);
    }

    public static star(    numVerticesPerRadius: number,
                           radius: number = 1,
    innerRadius: number = .5,
    rounding: CornerRounding = CornerRounding.Unrounded,
    innerRounding: CornerRounding | null = null,
    perVertexRounding: CornerRounding[] | null = null,
    centerX: number = 0,
    centerY: number = 0) {
        let pvRounding = perVertexRounding
        // If no per-vertex rounding supplied and caller asked for inner rounding,
        // create per-vertex rounding list based on supplied outer/inner rounding parameters
        if (pvRounding == null && innerRounding != null) {
            pvRounding = Array.from({ length }).flatMap(() => [rounding, innerRounding]);
        }

        return RoundedPolygon.fromVertices(this.starVerticesFromNumVerts(numVerticesPerRadius, radius, innerRadius, centerX, centerY), rounding, perVertexRounding, centerX, centerY);
    }

    private static starVerticesFromNumVerts(
        numVerticesPerRadius: number,
        radius: number,
        innerRadius: number,
        centerX: number,
        centerY: number,
    ) {
        const result = []
        var arrayIndex = 0
        for (let i = 0; i < numVerticesPerRadius; i++) {
            var vertex = radialToCartesian(radius, (Math.PI / numVerticesPerRadius * 2 * i))
            result[arrayIndex++] = vertex.x + centerX
            result[arrayIndex++] = vertex.y + centerY
            vertex = radialToCartesian(innerRadius, (Math.PI / numVerticesPerRadius * (2 * i + 1)))
            result[arrayIndex++] = vertex.x + centerX
            result[arrayIndex++] = vertex.y + centerY
        }
        return result;
    }
}