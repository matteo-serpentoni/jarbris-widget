import React from 'react';
import * as Sentry from '@sentry/react';
import { reportError } from '../../services/errorApi';
import { postToParent } from '../../config/bridge';

/**
 * ErrorBoundary
 * Catches React errors and reports them to the server silently.
 * Renders null on error to avoid breaking the merchant's site.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Report to Sentry
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo?.componentStack } },
    });

    // Report to server via service
    reportError({
      message: error?.message || 'Unknown error',
      stack: error?.stack || null,
      componentStack: errorInfo?.componentStack || null,
      shopDomain: new URLSearchParams(window.location.search).get('shop') || 'unknown',
      userAgent: navigator.userAgent,
      url: window.location.href,
    });

    // Notify parent to self-destruct iframe so it doesn't block the screen
    postToParent({ type: 'JARBRIS:fatalError' });
  }

  render() {
    if (this.state.hasError) {
      // Silent Failure: If a fallback prop is provided, render it.
      // Otherwise render null to protect the merchant's site.
      return this.props.fallback || null;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
