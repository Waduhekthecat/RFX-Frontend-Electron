import React from "react";

/**
 * Stripe
 * - Seamless repeating diagonal stripe divider
 * - Fills parent height
 * - Width/color are configurable
 */
export function Stripe({
  width = 8,
  color = "#5cff8d",
  background = "#05070a",
  stripeSize = 5,
  gapSize = 8,
  angle = 135,
  className = "",
  style = {},
}) {
  const period = stripeSize + gapSize;

  return (
    <div
      className={className}
      style={{
        width,
        height: "100%",
        minHeight: "100%",
        flex: `0 0 ${width}px`,
        backgroundColor: background,
        backgroundImage: `repeating-linear-gradient(
          ${angle}deg,
          ${color} 0px,
          ${color} ${stripeSize}px,
          ${background} ${stripeSize}px,
          ${background} ${period}px
        )`,
        boxShadow:
          "inset 1px 0 rgba(255,255,255,0.12), inset -1px 0 rgba(0,0,0,0.65)",
        ...style,
      }}
    />
  );
}