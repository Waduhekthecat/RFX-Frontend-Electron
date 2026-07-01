import { CONTROL_COLORS } from "../_styles";

const MIN_TEMPO_BPM = 40;
const MAX_TEMPO_BPM = 240;

const formatStopwatchTime = (milliseconds = 0) => {
  const totalSeconds = Math.floor(Math.max(milliseconds, 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((Math.max(milliseconds, 0) % 1000) / 100);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
};

export function LooperTimeline({
  isRecording,
  isOverdubbing,
  hasRecordedLoop,
  isPlaying,
  loopDurationMs,
  loopPositionMs,
  tempoBpm,
  isTapTempoActive,
  onTapTempo,
  isClickEnabled,
  onToggleClick,
  isCountInEnabled,
  onToggleCountIn,
  loopLengthEnabled,
  isLoopLengthLocked,
  loopLength,
  onToggleLoopLength,
  onCycleLoopLength,
  beatsPerMeasure,
  noteLength,
  onCycleBeatsPerMeasure,
  onCycleNoteLength,
}) {
  const progress =
    hasRecordedLoop && loopDurationMs > 0
      ? Math.min(loopPositionMs / loopDurationMs, 1)
      : 0;

  const status = isOverdubbing
    ? "Overdubbing"
    : isRecording
      ? "Recording"
      : isPlaying
        ? "Playing Loop"
        : hasRecordedLoop
          ? "Loop Playback Stopped"
          : "Start Record";

  const durationLabel = isRecording || hasRecordedLoop ? "Duration" : "";

  const durationContent =
    isRecording && !hasRecordedLoop
      ? formatStopwatchTime(loopDurationMs)
      : hasRecordedLoop
        ? `${(loopDurationMs / 1000).toFixed(2)}s loop`
        : "";

  const recordingWaveformBeatMs =
    60000 / Math.max(MIN_TEMPO_BPM, Math.min(tempoBpm, MAX_TEMPO_BPM));

  const bars = Array.from({ length: 64 }, (_, index) => {
    const wave = Math.sin(index * 0.48) * 0.5 + 0.5;
    const accent = Math.sin(index * 0.17 + 1.4) * 0.5 + 0.5;
    return 18 + wave * 46 + accent * 22;
  });

  return (
    <div className="flex h-full min-h-[220px] flex-col rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="grid flex-1 grid-cols-[minmax(180px,1.35fr)_auto_minmax(0,0.65fr)] items-stretch gap-3">
        <div className="min-w-0 self-start">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">
            Loop Timeline
          </div>
          <div className="mt-2 whitespace-nowrap text-lg font-semibold text-white">
            {status}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className={`flex h-[56px] w-[92px] items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold tabular-nums text-white/65 ${CONTROL_COLORS.grayFaint}`}>
            {tempoBpm} BPM
          </div>
          <button
            type="button"
            onClick={onTapTempo}
            className={`h-[56px] w-[92px] shrink-0 rounded-xl border px-5 py-2 text-base font-semibold text-white transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 ${isTapTempoActive ? CONTROL_COLORS.blueActive : CONTROL_COLORS.blueFaint}`}
          >
            TAP
          </button>
          <div
            className={`flex h-[56px] shrink-0 overflow-hidden rounded-xl border transition-all duration-150 ${isClickEnabled ? "border-amber-300/45 bg-amber-400/5" : "border-white/10 bg-white/[0.03]"}`}
          >
            <button
              type="button"
              onClick={onToggleClick}
              aria-pressed={isClickEnabled}
              className={`w-[92px] border-r border-white/10 px-3 py-2 text-sm font-semibold text-white transition-all duration-150 focus:outline-none focus-visible:bg-amber-300/15 ${isClickEnabled ? CONTROL_COLORS.amberActive : CONTROL_COLORS.grayFaint}`}
            >
              CLICK
            </button>
            <button
              type="button"
              onClick={onToggleCountIn}
              disabled={!isClickEnabled}
              aria-disabled={!isClickEnabled}
              aria-pressed={isCountInEnabled}
              className={`w-[128px] px-3 py-2 text-sm font-semibold text-white transition-all duration-150 focus:outline-none focus-visible:bg-purple-300/15 ${isClickEnabled ? (isCountInEnabled ? CONTROL_COLORS.purpleActive : CONTROL_COLORS.grayFaint) : "cursor-not-allowed bg-white/[0.02] text-white/35"}`}
            >
              COUNT-IN
            </button>
          </div>
          <div
            className={`flex h-[56px] shrink-0 overflow-hidden rounded-xl border transition-all duration-150 ${loopLengthEnabled ? "border-emerald-300/45 bg-emerald-400/5" : "border-white/10 bg-white/[0.03]"}`}
          >
            <button
              type="button"
              onClick={onToggleLoopLength}
              disabled={isLoopLengthLocked}
              aria-disabled={isLoopLengthLocked}
              aria-pressed={loopLengthEnabled}
              className={`w-[104px] border-r border-white/10 px-3 py-2 text-sm font-semibold text-white transition-all duration-150 focus:outline-none focus-visible:bg-emerald-300/15 ${isLoopLengthLocked ? "cursor-not-allowed opacity-60" : ""} ${loopLengthEnabled ? CONTROL_COLORS.greenActive : CONTROL_COLORS.grayFaint}`}
            >
              LENGTH
            </button>
            <button
              type="button"
              onClick={onCycleLoopLength}
              disabled={!loopLengthEnabled}
              aria-disabled={!loopLengthEnabled}
              className={`w-[92px] px-3 py-2 text-sm font-semibold text-white transition-all duration-150 focus:outline-none focus-visible:bg-emerald-300/15 ${loopLengthEnabled ? CONTROL_COLORS.greenFaint : "cursor-not-allowed bg-white/[0.02] text-white/35"}`}
            >
              {loopLength} BARS
            </button>
          </div>
          <div className="flex h-[56px] shrink-0 overflow-hidden rounded-xl border border-sky-300/25 bg-sky-400/5">
            <div className="flex w-[48px] items-center justify-center border-r border-white/10 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-100/60">
              Time
            </div>
            <button
              type="button"
              onClick={onCycleBeatsPerMeasure}
              aria-label={`Beats per measure: ${beatsPerMeasure}`}
              className="w-[54px] border-r border-white/10 text-xl font-semibold tabular-nums text-sky-100 transition-colors hover:bg-sky-300/10 focus:outline-none focus-visible:bg-sky-300/15"
            >
              {beatsPerMeasure}
            </button>
            <button
              type="button"
              onClick={onCycleNoteLength}
              aria-label={`Note length: ${noteLength}`}
              className="w-[54px] text-xl font-semibold tabular-nums text-sky-100 transition-colors hover:bg-sky-300/10 focus:outline-none focus-visible:bg-sky-300/15"
            >
              {noteLength}
            </button>
          </div>
        </div>

        <div className="flex min-w-0 items-start justify-end gap-3 self-start">
          <div className="shrink-0 text-right">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
              {durationLabel}
            </div>
            <div className="mt-2 text-sm font-semibold text-white/80">
              {durationContent}
            </div>
          </div>
        </div>
      </div>

      <div
        className="mt-6 flex h-[130px] items-end gap-1 rounded-xl border border-white/10 bg-black/30 p-3"
        style={{ "--rfx-recording-waveform-beat-ms": `${recordingWaveformBeatMs}ms` }}
      >
        {bars.map((height, index) => {
          const isWaveformBarGreen =
            (hasRecordedLoop && index / bars.length <= progress) || isRecording;
          const shouldBlinkWaveformBar =
            isRecording || (isOverdubbing && isWaveformBarGreen);

          return (
            <div
              key={index}
              className={`flex-1 rounded-full transition-colors duration-150 ${isWaveformBarGreen ? "bg-emerald-300/80" : "bg-white/15"} ${shouldBlinkWaveformBar ? "rfx-recording-waveform" : ""}`}
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-emerald-300"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
