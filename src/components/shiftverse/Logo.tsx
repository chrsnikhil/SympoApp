'use client';

import React from 'react';

/**
 * Web of Secrets Logo — custom image wordmark
 */
export default function Logo() {
  return (
    <div style={{ textAlign: 'center' }}>
      <img
        src="/logo.png"
        alt="Web of Secrets"
        className="logo-image"
        style={{
          maxWidth: 'min(420px, 85vw)',
          height: 'auto',
          display: 'block',
          margin: '0 auto',
          filter: 'drop-shadow(0 0 20px rgba(255, 45, 120, 0.4))',
        }}
      />
    </div>
  );
}
