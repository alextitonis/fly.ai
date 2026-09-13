import { onCLS, onINP, onLCP, onTTFB, onFCP } from "web-vitals";
import posthog from "posthog-js";

export function initWebVitals() {
  const report = (name: string) => (metric: { value: number; rating: string }) => {
    posthog.capture("web_vitals", {
      metric_name: name,
      value: Math.round(metric.value),
      rating: metric.rating,
      $set: {
        [`web_vitals_${name.toLowerCase()}`]: Math.round(metric.value),
      },
    });
  };

  onCLS(report("CLS"));
  onINP(report("INP"));
  onLCP(report("LCP"));
  onTTFB(report("TTFB"));
  onFCP(report("FCP"));
}
