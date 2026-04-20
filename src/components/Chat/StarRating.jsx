import { useState, memo } from 'react';
import { useI18n } from '../../hooks/useI18n';
import './StarRating.css';

const StarRating = memo(({ onRate, disabled = false }) => {
  const t = useI18n();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const handleRate = (value) => {
    if (disabled || submitted) return;
    setRating(value);
    setSubmitted(true);
    onRate(value);
  };

  if (submitted) {
    return (
      <div className="star-rating-container">
        <div className="star-rating-submitted-icon">🎉</div>
        <div className="star-rating-submitted-text">{t('feedback.thanks')}</div>
      </div>
    );
  }

  return (
    <div className="star-rating-container">
      <div className="star-rating-title">{t('feedback.rate_conversation')}</div>
      <div className="star-group" role="group" aria-label="Valutazione stelline">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`Valuta ${star} stelle su 5`}
            className={`star-button ${
              star <= (hover || rating) ? 'active' : ''
            } ${star <= hover ? 'hover' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={() => handleRate(star)}
            onMouseEnter={() => !disabled && setHover(star)}
            onMouseLeave={() => !disabled && setHover(rating)}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
});

export default StarRating;
