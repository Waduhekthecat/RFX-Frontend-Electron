import { Panel } from "../../../../components/ui/Panel";
import { styles } from "../_styles";

export function LooperHeader({ looperType }) {
  return (
    <Panel className="min-h-0">
      <div className={styles.HeaderInner}>
        <div className={styles.HeaderTitleGroup}>
          <div className={styles.HeaderTitle}>LOOPER</div>

          <div className={`${styles.LooperTypeBadge} ${looperType.classes}`}>
            [{looperType.label}]
          </div>
        </div>
      </div>
    </Panel>
  );
}
