import React, { useState, useLayoutEffect, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import './ImageLightbox.css';

const ImageLightbox = ({
  isOpen,
  images = [],
  currentIndex = 0,
  onClose,
  onNavigate,
  portalId = 'jarbris-gallery-portal',
}) => {
  const dragControls = useDragControls();
  const [target, setTarget] = useState(null);
  const [direction, setDirection] = useState(0);
  const [isPinching, setIsPinching] = useState(false); // Track pinch gesture on mobile

  const handleTouchStart = (e) => {
    if (e.touches.length > 1) {
      setIsPinching(true);
    } else {
      setIsPinching(false);
      if (images.length > 1) {
        dragControls.start(e);
      }
    }
  };

  const handleTouchMove = (e) => {
    // If we detect more than one finger during move, ensure pinching mode is active
    if (e.touches.length > 1 && !isPinching) {
      setIsPinching(true);
    }
  };

  const handleTouchEnd = () => {
    setIsPinching(false);
  };

  /* eslint-disable react-hooks/set-state-in-effect -- portal target lookup requires sync setState */
  useLayoutEffect(() => {
    const el = document.getElementById(portalId);
    if (el) {
      setTarget(el);
    } else {
      setTarget(document.getElementById('jarbris-drawer-portal') || document.body);
    }
  }, [portalId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleNavigate = useCallback(
    (newIndex, newDirection) => {
      setDirection(newDirection);
      onNavigate(newIndex);
    },
    [onNavigate],
  );

  const prevImage = useCallback(() => {
    handleNavigate((currentIndex - 1 + images.length) % images.length, -1);
  }, [currentIndex, images.length, handleNavigate]);

  const nextImage = useCallback(() => {
    handleNavigate((currentIndex + 1) % images.length, 1);
  }, [currentIndex, images.length, handleNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') prevImage();
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, prevImage, nextImage, onClose]);

  const thumbnailsRef = React.useRef(null);

  // Manual scroll for thumbnails to avoid shifting the whole page/lightbox
  useEffect(() => {
    if (thumbnailsRef.current) {
      const activeThumb = thumbnailsRef.current.children[currentIndex];
      if (activeThumb) {
        const container = thumbnailsRef.current;
        const scrollLeft =
          activeThumb.offsetLeft - container.offsetWidth / 2 + activeThumb.offsetWidth / 2;

        container.scrollTo({
          left: scrollLeft,
          behavior: 'smooth',
        });
      }
    }
  }, [currentIndex]);

  if (!target) return null;

  const currentImage = images[currentIndex];
  const imageUrl = currentImage?.url || currentImage || '';

  const variants = {
    enter: (direction) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  const swipeConfidenceThreshold = 5000;
  const swipePower = (offset, velocity) => {
    return Math.abs(offset) * velocity;
  };

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="jarbris-lightbox-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="jarbris-lightbox-backdrop" onClick={onClose} />

          <div className="jarbris-lightbox-content-group">
            <div className="jarbris-lightbox-container">
              <AnimatePresence initial={false} custom={direction}>
                <motion.div
                  key={currentIndex}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: 'spring', stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 },
                  }}
                  drag={images.length > 1 ? 'x' : false}
                  dragControls={dragControls}
                  dragListener={false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={1}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onDragEnd={(e, { offset, velocity }) => {
                    const swipe = swipePower(offset.x, velocity.x);
                    const dragOffsetTrigger = 50;

                    if (swipe < -swipeConfidenceThreshold || offset.x < -dragOffsetTrigger) {
                      nextImage();
                    } else if (swipe > swipeConfidenceThreshold || offset.x > dragOffsetTrigger) {
                      prevImage();
                    }
                  }}
                  className="jarbris-lightbox-image-wrapper"
                >
                  <img
                    src={imageUrl}
                    alt="Product Detail"
                    className="jarbris-lightbox-img"
                    draggable="false"
                  />
                </motion.div>
              </AnimatePresence>

              {images.length > 1 && (
                <>
                  <button
                    className="jarbris-lightbox-nav prev"
                    onClick={(e) => {
                      e.stopPropagation();
                      prevImage();
                    }}
                    aria-label="Immagine precedente"
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                  </button>
                  <button
                    className="jarbris-lightbox-nav next"
                    onClick={(e) => {
                      e.stopPropagation();
                      nextImage();
                    }}
                    aria-label="Prossima immagine"
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                </>
              )}
            </div>

            {images.length > 1 && (
              <div className="jarbris-lightbox-thumbnails-wrapper">
                <div className="jarbris-lightbox-thumbnails" ref={thumbnailsRef}>
                  {images.map((img, i) => (
                    <div
                      key={i}
                      className={`jarbris-lightbox-thumbnail ${i === currentIndex ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (i !== currentIndex) {
                          handleNavigate(i, i > currentIndex ? 1 : -1);
                        }
                      }}
                    >
                      <img src={img?.url || img} alt={`View ${i + 1}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              className="jarbris-lightbox-close"
              onClick={onClose}
              aria-label="Chiudi gallery"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return ReactDOM.createPortal(content, target);
};

export default ImageLightbox;
