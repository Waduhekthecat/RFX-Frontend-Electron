// src/components/controls/knobs/_styles.js

export const SPRITE_FRAMES = 200;
export const RENDER_SIZE = 140;
export const CENTER_FRAME = 96; // “straight up” frame index in the strip

export const styles = {
  // ---- Knob ----
  knobWrap: (containerW) => ({
    width: containerW,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 0,
  }),

  knobFace: ({ dragging, mapDragActive, canAcceptMap, mapDragOver }) => ({    width: RENDER_SIZE,
    height: RENDER_SIZE,
    borderRadius: 999,
    overflow: "hidden",
    position: "relative",
    touchAction: "none",
    cursor: "ns-resize",
    background: "transparent",
    border: "none",
    transform: mapDragOver ? "scale(1.06)" : "scale(1)",
    transition: "transform 120ms ease, filter 120ms ease",
    filter: mapDragOver
      ? "drop-shadow(0px 0px 18px rgba(142,224,255,0.48)) drop-shadow(0px 16px 26px rgba(0,0,0,0.78))"
      : mapDragActive && canAcceptMap
        ? "drop-shadow(0px 0px 10px rgba(142,224,255,0.30)) drop-shadow(0px 16px 26px rgba(0,0,0,0.82))"
        : dragging
          ? "drop-shadow(0px 8px 14px rgba(0,0,0,0.60))"
          : "drop-shadow(0px 16px 26px rgba(0,0,0,0.85))",
  }),

  knobImg: (stripW, stripH, y) => ({
    position: "absolute",
    left: "50%",
    top: 0,
    width: stripW,
    height: stripH,
    transform: `translateX(-50%) translateY(${y}px)`,
    userSelect: "none",
    WebkitUserSelect: "none",
    pointerEvents: "none",
  }),

  labelWrap: {
    textAlign: "center",
    width: "100%",
    marginTop: -10,
  },

  label: {
    fontSize: 11,
    fontWeight: 700,
    lineHeight: "12px",
  },

  mappedLabel: {
    marginTop: 2,
    fontSize: 10,
    opacity: 0.6,
    lineHeight: "11px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  // ---- KnobRow ----
  rowOuter: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },

  rowGrid: (count) => ({
    width: "100%",
    height: "100%",
    display: "grid",
    gridTemplateColumns: `repeat(${count || 1}, 1fr)`,
    justifyItems: "center",
    alignItems: "end",
    padding: "20px 36px",
    borderRadius: 13,
    background: `
      linear-gradient(
        180deg,
        rgba(255,255,255,0.08),
        rgba(255,255,255,0.02) 0%,
        rgba(0,0,0,0.45)
      ),
      repeating-linear-gradient(
        90deg,
        rgba(255,255,255,0.03) 0px,
        rgba(255,255,255,0.03) 1px,
        transparent 1px,
        transparent 3px
      ),
      #1a1a1a
    `,
    boxShadow: `
      inset 0 1px 0 rgba(255,255,255,0.20),
      inset 0 -8px 18px rgba(0,0,0,0.7),
      0 20px 40px rgba(0,0,0,0.6)
    `,
  }),
};