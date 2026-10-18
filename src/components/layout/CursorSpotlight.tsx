"use client";

import { useEffect } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from "framer-motion";

export function CursorSpotlight() {
  const pointerX = useMotionValue(-1000);
  const pointerY = useMotionValue(-1000);
  const smoothX = useSpring(pointerX, { damping: 30, stiffness: 350 });
  const smoothY = useSpring(pointerY, { damping: 30, stiffness: 350 });
  const opacity = useSpring(0, { damping: 30, stiffness: 350 });
  const background = useMotionTemplate`radial-gradient(circle 560px at ${smoothX}px ${smoothY}px, rgba(0, 240, 255, 0.08), rgba(138, 43, 226, 0.05) 40%, transparent 80%)`;

  useEffect(() => {
    const root = document.documentElement;
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointerX.set(event.clientX);
      pointerY.set(event.clientY);
      opacity.set(1);
    };
    const handlePointerEnter = () => opacity.set(1);
    const handlePointerLeave = () => opacity.set(0);

    root.addEventListener("pointermove", handlePointerMove, { passive: true });
    root.addEventListener("pointerenter", handlePointerEnter, { passive: true });
    root.addEventListener("pointerleave", handlePointerLeave, { passive: true });

    return () => {
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerenter", handlePointerEnter);
      root.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [opacity, pointerX, pointerY]);

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden mix-blend-screen"
      style={{ background, opacity }}
    />
  );
}
