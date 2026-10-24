import React, { useState } from 'react';
import { FACES, RatingFace } from './SupportIcons';

// "How would you like to rate my assistance?" with five colourful faces, at the bottom of the screen when a chat or a call ends (like the end of a delivery app's support chat).
// Tap a face (it grows, the others fade), say something if you like, and send. The rating goes to the same place as before (submitSupportReview, 1 to 5).

interface Props {
  /** true inside the chat (it replaces the typing bar), false over another screen (the page behind is dimmed) */
  flat: boolean;
  submitted: boolean;
  onSubmit: (rating: number, feedback: string) => void;
  onSkip: () => void;
}

export const SupportRatingSheet: React.FC<Props> = ({ flat, submitted, onSubmit, onSkip }) => {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const picked = FACES.find((f) => f.value === rating);

  return (
    <>
      {!flat && <div className="sd-scrim" onClick={submitted ? undefined : onSkip} />}
      <div className={`sd-rate ${flat ? 'flat' : ''}`} role="dialog" aria-label="Rate your help" data-testid="support-rating">
        {submitted ? (
          <div className="sd-thanks" data-testid="support-rating-thanks">
            <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#1faa4b" /><path d="M14 25l7 7 13-15" fill="none" stroke="#fff" strokeWidth="4.200" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <strong>Thank you for your feedback!</strong>
            <span>It helps us make NOOB support better.</span>
          </div>
        ) : (
          <>
            <h3>How would you like to rate my assistance?</h3>
            <div className={`sd-faces ${rating ? 'picked' : ''}`} role="radiogroup" aria-label="Your rating">
              {FACES.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={rating === f.value}
                  aria-label={`${f.value} of 5: ${f.label}`}
                  className={`sd-face ${rating === f.value ? 'sel' : ''}`}
                  onClick={() => setRating(f.value)}
                  data-testid={`support-face-${f.value}`}
                >
                  <RatingFace kind={f.kind} />
                </button>
              ))}
            </div>
            <div className="sd-face-label" aria-live="polite">{picked?.label ?? ''}</div>
            {rating > 0 && (
              <textarea
                className="sd-say"
                rows={2}
                maxLength={500}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Anything you would like to add? (optional)"
                aria-label="Your feedback"
                data-testid="support-rating-text"
              />
            )}
            <div className="sd-actions">
              <button type="button" className="sd-btn ghost" onClick={onSkip} data-testid="support-rating-skip">Skip</button>
              <button type="button" className="sd-btn green" disabled={!rating} onClick={() => onSubmit(rating, feedback)} data-testid="support-rating-submit">Submit</button>
            </div>
          </>
        )}
      </div>
    </>
  );
};
