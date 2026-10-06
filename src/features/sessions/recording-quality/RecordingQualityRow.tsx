import type { RecordingQuality } from "../../../api";
import { InfoRow } from "../../../shared/components";
import { describeRecordingQuality } from "./describeRecordingQuality";
import "./RecordingQualityRow.css";

/** "Mic signal" row in Session Details, with tips when the signal had problems. */
export default function RecordingQualityRow({ quality }: { quality: RecordingQuality }) {
  const d = describeRecordingQuality(quality);

  return (
    <>
      <InfoRow
        label="Mic signal"
        value={
          <span className="recording-quality-value">
            <span className={`recording-quality-badge rating-${d.rating}`}>{d.label}</span>
            <span className="recording-quality-summary">{d.summary}</span>
          </span>
        }
      />
      {d.tips.length > 0 && (
        <ul className="recording-quality-tips">
          {d.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
    </>
  );
}
