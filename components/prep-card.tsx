// The session's prep card: what to bring, ideas and the safety note. Shown on the booking page and, compact,
// when Details is opened on the calendar (Kelly 10 Nov: "Details button should go right to PREP CARD").
import type { SessionContent } from '@/lib/session-data';

export default function PrepCard({ prep, card, compact = false }: { prep: string; card?: SessionContent; compact?: boolean }) {
  return (
    <div className={compact ? 'prep-panel prep-panel-compact' : 'prep-panel'}>
      <div className="prep-panel-heading">
        <p className="section-label">Your prep card</p>
        <span>Review before your session</span>
      </div>
      <h2>What to bring</h2>
      <p className="full-prep-copy">{prep}</p>
      {(card?.ideas || card?.note) && (
        <div className="full-prep-details">
          {card?.ideas && (
            <>
              <p className="detail-label">Ideas & prompts</p>
              <div className="idea-list">
                {card.ideas.map((idea) => (
                  <span key={idea}>{idea}</span>
                ))}
              </div>
            </>
          )}
          {card?.note && (
            <p className="booking-safety-note">
              <strong>Please note:</strong> {card.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
