export function LooperControlButton({
  badge,
  active,
  inactiveClasses,
  activeClasses,
  onPointerDown,
  onPointerUp,
  onKeyDown,
  onKeyUp,
}) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      aria-pressed={active}
      aria-label={`${badge.footswitch} ${badge.command}`}
      className={`rounded-xl border px-3 py-3 h-full min-h-[140px] text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 ${active ? activeClasses : inactiveClasses}`}
    >
      <div className="mt-3 text-sm font-semibold leading-snug text-white/50">
        <span>{badge.footswitch}</span>
      </div>

      <div className="mt-3 text-sm font-semibold leading-snug text-white">
        {badge.command}
      </div>
    </button>
  );
}
