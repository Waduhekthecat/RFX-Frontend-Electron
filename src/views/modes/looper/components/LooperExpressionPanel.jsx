import { Knob } from "../../../../components/controls/knobs/Knob";
import { styles } from "../_styles";

export function LooperExpressionPanel({
  active,
  expressionType,
  expressionValue,
  formattedExpressionValue,
  onExpressionChange,
}) {
  return (
    <div
      className={`${styles.ExpressionPanel} ${active ? expressionType.activeClasses : expressionType.faintClasses}`}
    >
      <div className="mt-3 text-sm font-semibold leading-snug text-white/50">
        EXPR
      </div>

      <div className="mt-3 text-sm font-semibold leading-snug text-white">
        {expressionType.label}
      </div>

      <div className="mt-4 flex justify-center">
        <Knob
          id="looper-playback-master-volume"
          label={expressionType.knobLabel}
          value={expressionValue}
          mapped={false}
          mappedLabel=""
          onChange={onExpressionChange}
          onCommit={() => {}}
        />
      </div>

      <div className="mt-1 text-center text-2xl font-bold tabular-nums text-white">
        {formattedExpressionValue}
      </div>
    </div>
  );
}
