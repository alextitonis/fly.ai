import { useRef, useEffect, useMemo } from "react";
import Lottie from "lottie-react";
import type { LottieRefCurrentProps } from "lottie-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

// The sidebar Lottie JSONs bake their stroke/fill colors as a single near-black
// RGB triplet. Re-color them at runtime per theme so the markup never needs a
// `filter: invert(...)` for dark mode. CSS filters always rasterize the affected
// subtree, which produced visible aliasing on non-retina screens.
const SOURCE_COLOR: readonly [number, number, number] = [
  0.078431372549, 0.090196078431, 0.133333333333,
];
const DARK_THEME_COLOR: readonly [number, number, number] = [1, 1, 1];

function colorsMatch(a: readonly number[], b: readonly number[]) {
  // Allow tiny float drift from JSON re-encoding.
  return (
    Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3 && Math.abs(a[2] - b[2]) < 1e-3
  );
}

function recolorLottieInPlace(data: unknown, target: readonly [number, number, number]): void {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    // Static color descriptor in lottie: { a: 0, k: [r, g, b, a?], ... }
    if (
      obj.a === 0 &&
      Array.isArray(obj.k) &&
      obj.k.length >= 3 &&
      obj.k.every((v) => typeof v === "number") &&
      colorsMatch(obj.k as number[], SOURCE_COLOR)
    ) {
      const original = obj.k as number[];
      obj.k = original.length === 4 ? [...target, original[3]] : [...target];
      return;
    }
    Object.values(obj).forEach(visit);
  };
  visit(data);
}

export function LottieIcon({
  animationData,
  isHovered,
  isActive,
}: {
  animationData: unknown;
  isHovered: boolean;
  isActive: boolean;
}) {
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const { resolvedTheme } = useTheme();

  const target = resolvedTheme === "dark" ? DARK_THEME_COLOR : SOURCE_COLOR;
  // Always hand Lottie a fresh clone: lottie-web mutates the animation object
  // in place (adds expression caches / functions), and re-running structuredClone
  // on a mutated source throws DataCloneError on the next theme switch.
  const themedData = useMemo(() => {
    const cloned = structuredClone(animationData);
    if (target !== SOURCE_COLOR) recolorLottieInPlace(cloned, target);
    return cloned;
  }, [animationData, target]);

  useEffect(() => {
    if (!lottieRef.current) return;
    // Only react to hover-in. On hover-out we intentionally do nothing —
    // the animation is allowed to finish naturally and is reset to frame 0
    // via the onComplete handler. This way a brief hover still plays fully.
    if (!isHovered) return;
    lottieRef.current.goToAndPlay(0);
  }, [isHovered]);

  return (
    <Lottie
      lottieRef={lottieRef}
      animationData={themedData}
      loop={false}
      autoplay={false}
      onComplete={() => {
        lottieRef.current?.goToAndStop(0);
      }}
      // Canvas renderer rasterizes the animation once at the canvas' native
      // devicePixelRatio-aware pixel size. The SVG renderer emitted visibly
      // pixelated output at 24×24 because each layer transform (scale ~33×)
      // composed with the SVG viewport scale (1/33×) caused some browsers to
      // rasterize intermediate shapes at the authored sub-pixel size. Canvas
      // avoids the per-shape raster pipeline entirely.
      // Cast: lottie-react's <Lottie> component doesn't expose its renderer
      // generic, so the prop type is locked to "svg" even though the runtime
      // accepts "canvas". useLottie<"canvas"> would type cleanly but requires
      // a larger refactor.
      renderer={"canvas" as "svg"}
      rendererSettings={{
        // Keep pixel-perfect output on HiDPI displays; canvas renderer honors
        // devicePixelRatio when this is not overridden.
        preserveAspectRatio: "xMidYMid meet",
      }}
      className={cn(
        "size-6 transition-opacity [&>canvas]:size-full [&>svg]:size-full",
        isActive || isHovered ? "opacity-100" : "opacity-60",
      )}
    />
  );
}
