"use client";

import { motion } from "motion/react";

/**
 * Sections arrive once and then hold still.
 *
 * `once: true` is the whole point — content that re-animates every time it re-enters the viewport
 * reads as a demo of scroll effects rather than as a page, and it makes the FAQ unusable.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
