import React, { memo } from 'react';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion } from 'framer-motion';
import { useI18n } from '../../hooks/useI18n';
import './CategoryCards.css';

const CategoryCard = memo(({ category, index, onCategoryClick }) => {
  const { title, count, image } = category;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      onClick={() => onCategoryClick(category)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCategoryClick(category);
        }
      }}
      className="jarbris-category-card"
      role="button"
      tabIndex={0}
      aria-label={`Visualizza prodotti della categoria ${title}`}
      whileHover={{ scale: 1.02, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Category Image / Icon */}
      <div className="jarbris-category-card-image-container">
        {image ? (
          <img src={image} alt={title} className="jarbris-category-card-image" loading="lazy" />
        ) : (
          <span className="jarbris-category-placeholder">📁</span>
        )}
      </div>

      {/* Info */}
      <div className="jarbris-category-info">
        <div className="jarbris-category-name">{title}</div>
        <div className="jarbris-category-count">
          {count} {count === 1 ? 'prodotto' : 'prodotti'}
        </div>
      </div>

      {/* Arrow Icon */}
      <div className="jarbris-category-arrow">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </motion.div>
  );
});

const CategoryCards = memo(({ message, onCategoryClick }) => {
  const t = useI18n();
  const { categories = [], message: displayMessage } = message;

  if (!Array.isArray(categories) || categories.length === 0) {
    return null;
  }

  return (
    <div className="jarbris-category-cards-container">
      {/* Intro Message */}
      <div className="jarbris-category-intro">{displayMessage || 'Seleziona una categoria:'}</div>

      {/* Cards List */}
      <div className="jarbris-category-list">
        {categories.map((category, index) => (
          <CategoryCard
            key={category.handle || index}
            category={category}
            index={index}
            onCategoryClick={onCategoryClick}
          />
        ))}
      </div>

      {/* Help text */}
      <div className="jarbris-category-help-text">{t('ui.click_category')}</div>
    </div>
  );
});

export default CategoryCards;
