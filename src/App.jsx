import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Orb from './components/Orb/Orb';
import storage from './utils/storage';

function App() {
  // Detect if running in proper embedded context
  const isEmbedded = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true; // cross-origin iframe = embedded
    }
  })();

  const params = new URLSearchParams(window.location.search);
  const hasEmbedParam = params.has('embed');
  const isAllowedRoute = ['/orb-preview', '/widget/orb-preview'].includes(window.location.pathname);
  const isDirectAccess = !isEmbedded && !hasEmbedParam && !isAllowedRoute && import.meta.env.PROD;

  const [enlarged, setEnlarged] = useState(() => {
    return storage.get('orb_enlarged') === 'true';
  });
  const [cartBubbleVisible, setCartBubbleVisible] = useState(false);

  useEffect(() => {
    const isEnlarged = typeof enlarged === 'object' ? enlarged.isEnlarged : enlarged;

    const performResize = () => {
      const resizeData = {
        type: 'JARBRIS:resize',
        enlarged: isEnlarged,
        width: isEnlarged ? 1000 : enlarged?.proactive ? 380 : cartBubbleVisible ? 460 : 350,
        height: isEnlarged ? 1000 : enlarged?.proactive ? 450 : 350,
      };

      if (typeof enlarged === 'object') {
        if (enlarged.width) resizeData.width = enlarged.width;
        if (enlarged.height) resizeData.height = enlarged.height;
      }

      window.parent?.postMessage(resizeData, '*');
    };

    if (isEnlarged || cartBubbleVisible) {
      // Open immediately to avoid clipping during expansion
      performResize();
    } else {
      // Delay closing to match CSS transition (600ms)
      const timer = setTimeout(performResize, 600);
      return () => clearTimeout(timer);
    }
  }, [enlarged, cartBubbleVisible]);

  useEffect(() => {
    storage.set('orb_enlarged', enlarged.toString());
  }, [enlarged]);

  useEffect(() => {
    const isEmbed = new URLSearchParams(window.location.search).get('embed');
    if (isEmbed) {
      document.body.style.backgroundColor = 'transparent';
    }
  }, []);

  // --- DEV-ONLY PREVIEW LOGIC ---
  const [devPreview, setDevPreview] = useState({
    show: storage.get('dev_show_storefront') === 'true',
    theme: storage.get('dev_storefront_theme') || 'light',
  });

  useEffect(() => {
    if (import.meta.env.MODE !== 'development') return;

    const handleDevUpdate = () => {
      setDevPreview({
        show: storage.get('dev_show_storefront') === 'true',
        theme: storage.get('dev_storefront_theme') || 'light',
      });
    };

    window.addEventListener('jarbris_dev_update', handleDevUpdate);
    return () => window.removeEventListener('jarbris_dev_update', handleDevUpdate);
  }, []);

  // Conditionally load MockStorefront only in dev
  const MockStorefront = React.lazy(() =>
    import.meta.env.MODE === 'development'
      ? import('./components/Dev/MockStorefront')
      : Promise.resolve({ default: () => null }),
  );

  if (isDirectAccess) return null;

  return (
    <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Routes>
        <Route
          path="/"
          element={
            <div
              className="App"
              style={{
                width: '100vw',
                height: '100vh',
                overflow: 'hidden', // Prevent internal page scrolling
                position: 'fixed', // Lock the viewport
                background:
                  new URLSearchParams(window.location.search).get('embed') ||
                  (import.meta.env.MODE === 'development' && devPreview.show)
                    ? 'transparent'
                    : '#232733',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {import.meta.env.MODE === 'development' && devPreview.show && (
                <React.Suspense fallback={null}>
                  <MockStorefront theme={devPreview.theme} />
                </React.Suspense>
              )}
              <Orb
                enlarged={enlarged}
                setEnlarged={setEnlarged}
                onBubbleVisibilityChange={setCartBubbleVisible}
              />
            </div>
          }
        />
        <Route
          path="/orb-preview"
          element={<Orb mode="preview" enlarged={true} setEnlarged={() => {}} />}
        />
        <Route
          path="/widget/orb-preview"
          element={<Orb mode="preview" enlarged={true} setEnlarged={() => {}} />}
        />
      </Routes>
    </Router>
  );
}

export default App;
