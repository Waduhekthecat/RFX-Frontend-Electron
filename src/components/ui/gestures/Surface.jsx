function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

/**
 * GestureSurface
 * A reusable wrapper for any touch/pointer interactive element.
 *
 * Props:
 * - gesture: object returned by a gesture hook (e.g. useDoubleTap(), useLongPress())
 *            expected shape: { bind, style } (like we built)
 * - as: element type (default "div")
 * - className, style: merged with gesture defaults
 * - children
 *
 * Usage:
 *   const dbl = useDoubleTap(() => reset());
 *   <GestureSurface gesture={dbl} className="h-full">
 *     <Slider ... />
 *   </GestureSurface>
 */
export function Surface({
  gesture,
  as: As = "div",
  className,
  style,
  children,
  ...rest
}) {
  const gBind = gesture?.bind || {};
  const gStyle = gesture?.style || {};

  // Merge styles: caller can override
  const mergedStyle = { ...gStyle, ...(style || {}) };

  return (
    <As
      {...gBind}
      {...rest}
      className={cx(className)}
      style={mergedStyle}
    >
      {children}
    </As>
  );
}