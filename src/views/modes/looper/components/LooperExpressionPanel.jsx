import { Knob } from "../../../../components/controls/knobs/Knob";
import { CONTROL_COLORS, styles } from "../_styles";

export function LooperExpressionPanel({
  active,
  playbackMasterVolume,
  formattedPlaybackMasterVolume,
  onExpressionChange,
}) {
  return (
    <div
      className={`${styles.ExpressionPanel} ${active ? CONTROL_COLORS.blueActive : CONTROL_COLORS.blueFaint}`}
    >
      <div className="mt-3 text-sm font-semibold leading-snug text-white/50">
        EXPR
      </div>

      <div className="mt-3 text-sm font-semibold leading-snug text-white">
        Output
      </div>

      <div className="mt-4 flex justify-center">
        <Knob
          id="looper-playback-master-volume"
          label="Volume"
          value={playbackMasterVolume}
          mapped={false}
          mappedLabel=""
          onChange={onExpressionChange}
          onCommit={() => {}}
        />
      </div>

      <div className="mt-1 text-center text-2xl font-bold tabular-nums text-white">
        {formattedPlaybackMasterVolume}
      </div>
    </div>
  );
}
