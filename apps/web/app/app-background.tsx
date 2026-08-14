"use client";

import { useEffect, useState } from "react";
import { GradientWaves } from "./gradient-waves";
import { useTheme } from "./theme";

/**
 * Waves fade to `horizon` at the fog line, so it's set to match --bg exactly —
 * the canvas blends into the page instead of showing a seam. `wave` and `crest`
 * carry the YouTube-red accent, saturated enough to read clearly against the
 * background instead of disappearing into it.
 */
const PALETTE = {
  light: { horizon: "#f6f5f2", wave: "#ff9d9d", crest: "#ff2b2b" },
  dark: { horizon: "#0c0d10", wave: "#8a1c24", crest: "#ff4747" },
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export function AppBackground() {
  const { resolved } = useTheme();
  const reducedMotion = usePrefersReducedMotion();
  const colors = PALETTE[resolved];

  return (
    <div className="app-background" style={{ background: colors.horizon }} aria-hidden="true">
      {!reducedMotion && (
        <GradientWaves
          horizonColor={colors.horizon}
          waveColor={colors.wave}
          crestColor={colors.crest}
          speed={0.22}
          amplitude={2.4}
          waveScale={0.55}
          waveRatio={0.85}
          swell={30}
          turbulence={16}
          tilt={1.15}
          zoom={1.0}
          height={5.5}
          fogDepth={15}
          detail="low"
          brightness={resolved === "dark" ? 1.1 : 1.05}
          opacity={resolved === "dark" ? 0.9 : 0.75}
          mouseInteraction={true}
          parallaxStrength={0.25}
          grain={true}
          grainIntensity={0.03}
        />
      )}
    </div>
  );
}
