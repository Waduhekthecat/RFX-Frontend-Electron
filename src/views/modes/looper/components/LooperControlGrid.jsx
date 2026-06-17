import { LooperControlButton } from "./LooperControlButton";
import { styles } from "../_styles";

export function LooperControlGrid({
  badges,
  activeControls,
  getBadgeClasses,
  onPressControl,
  onReleaseControl,
  onControlKeyDown,
  onControlKeyUp,
}) {
  return (
    <div className={styles.ControlGrid}>
      {badges.map((badge) => {
        const { inactiveClasses, activeClasses } = getBadgeClasses(badge);

        return (
          <LooperControlButton
            key={badge.control}
            badge={badge}
            active={activeControls.has(badge.control)}
            inactiveClasses={inactiveClasses}
            activeClasses={activeClasses}
            onPointerDown={() => onPressControl(badge.control)}
            onPointerUp={() => onReleaseControl(badge.control)}
            onKeyDown={(event) => onControlKeyDown(event, badge.control)}
            onKeyUp={(event) => onControlKeyUp(event, badge.control)}
          />
        );
      })}
    </div>
  );
}
