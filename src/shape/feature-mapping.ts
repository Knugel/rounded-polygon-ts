import { Corner, type Feature } from "./feature";
import { DoubleMapper, progressInRange } from "./float-mapping";
import { Point } from "./point";
import { DistanceEpsilon } from "./utils";

type MeasuredFeatures = ProgressableFeature[];

const IdentityMapping = [{ a: 0, b: 0 }, { a: 0.5, b: 0.5 }];

export class ProgressableFeature {
    constructor(public readonly progress: number, public readonly feature: Feature) { }
}

export class DistanceVertex {
    constructor(public readonly distance: number, public readonly f1: ProgressableFeature, public readonly f2: ProgressableFeature) {
    }
}

export function featureMapper(features1: MeasuredFeatures, features2: MeasuredFeatures): DoubleMapper {
    // We only use corners for this mapping.
    const filteredFeatures1: ProgressableFeature[] = [];
    for (let i = 0; i < features1.length; i++) {
        if (features1[i].feature instanceof Corner) {
            filteredFeatures1.push(features1[i])
        }
    }

    const filteredFeatures2: ProgressableFeature[] = [];
    for (let i = 0; i < features2.length; i++) {
        if (features2[i].feature instanceof Corner) {
            filteredFeatures2.push(features2[i])
        }
    }

    const featureProgressMapping = doMapping(filteredFeatures1, filteredFeatures2)
    return new DoubleMapper(...featureProgressMapping);
}


function doMapping(
    features1: ProgressableFeature[],
    features2: ProgressableFeature[],
): { a: number, b: number }[] {
    // Build and sort distance vertex list
    const distanceVertexList: DistanceVertex[] = [];
    for (const f1 of features1) {
        for (const f2 of features2) {
            const d = featureDistSquared(f1.feature, f2.feature);
            if (d !== Number.MAX_VALUE) {
                distanceVertexList.push(new DistanceVertex(d, f1, f2));
            }
        }
    }
    distanceVertexList.sort((a, b) => a.distance - b.distance);

    // Special cases
    if (distanceVertexList.length === 0) return IdentityMapping;
    if (distanceVertexList.length === 1) {
        const { f1, f2 } = distanceVertexList[0];
        const p1 = f1.progress;
        const p2 = f2.progress;
        return [
            { a: p1, b: p2 },
            { a: (p1 + 0.5) % 1, b: (p2 + 0.5) % 1 }
        ];
    }

    // Assuming MappingHelper is defined elsewhere
    const helper = new MappingHelper();
    distanceVertexList.forEach(({ f1, f2 }) => helper.addMapping(f1, f2));
    return helper.mapping;
}

class MappingHelper {
    public mapping: { a: number, b: number }[] = []

    private usedF1 = new Set<ProgressableFeature>();
    private usedF2 = new Set<ProgressableFeature>();

    addMapping(f1: ProgressableFeature, f2: ProgressableFeature) {
        if (this.usedF1.has(f1) || this.usedF2.has(f2))
            return;

        const index = this.mapping.findIndex(x => x.a === f1.progress);
        const insertionIndex = -index - 1;
        const n = this.mapping.length;

        if (n >= 1) {
            const { a: before1, b: before2 } = this.mapping[(insertionIndex + n - 1) % n]
            const { a: after1, b: after2 } = this.mapping[insertionIndex % n]

            // We don't want features that are way too close to each other, that will make the
            // DoubleMapper unstable
            if (
                progressDistance(f1.progress, before1) < DistanceEpsilon ||
                progressDistance(f1.progress, after1) < DistanceEpsilon ||
                progressDistance(f2.progress, before2) < DistanceEpsilon ||
                progressDistance(f2.progress, after2) < DistanceEpsilon
            ) {
                return
            }

            // When we have 2 or more elements, we need to ensure we are not adding extra crossings.
            if (n > 1 && !progressInRange(f2.progress, before2, after2)) return
        }

        // All good, we can add the mapping.
        this.mapping.splice(insertionIndex, 0, { a: f1.progress, b: f2.progress });
        this.usedF1.add(f1)
        this.usedF2.add(f2)
    }
}

function featureDistSquared(f1: Feature, f2: Feature): number {
    // TODO: We might want to enable concave-convex matching in some situations. If so, the
    //  approach below will not work
    if (f1 instanceof Corner && f2 instanceof Corner && f1.convex != f2.convex) {
        // Simple hack to force all features to map only to features of the same concavity, by
        // returning an infinitely large distance in that case
        return Number.MAX_VALUE
    }
    return (featureRepresentativePoint(f1).minus(featureRepresentativePoint(f2))).getDistanceSquared();
}

function featureRepresentativePoint(feature: Feature): Point {
    const x = (feature.cubics.at(0)!.anchor0X + feature.cubics.at(-1)!.anchor1X) / 2
    const y = (feature.cubics.at(0)!.anchor0Y + feature.cubics.at(-1)!.anchor1Y) / 2
    return new Point(x, y)
}

function progressDistance(p1: number, p2: number) {
    const it = Math.abs(p1 - p2);
    return Math.min(it, 1 - it);
}