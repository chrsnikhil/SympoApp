'use client';

import React from 'react';
import Link from 'next/link';

/**
 * Web of Secrets — Full-screen landing page
 * Shows the event background, logo, info panel, and "Swing In" button.
 * Clicking the button navigates to the /game route.
 */
export default function LandingPage() {

  return (
    <>
      {/* Background Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        id="bg-image"
        src="/bg-image.jpg"
        alt=""
        aria-hidden="true"
      />

      {/* Gradient Tint Overlay */}
      <div id="overlay" aria-hidden="true" />

      {/* Hero — Large center-left event logo */}
      <main id="hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          id="event-logo"
          src="/event-logo.png"
          alt="Web of Secrets — Event Logo"
        />

        {/* Info Panel */}
        <div id="info-panel">
          <p>
            Decode the encrypted Caesar Cipher messages to reveal the correct
            answers. Every second counts, so think carefully before submitting
            your answer.
          </p>
          <p>
            Play fair, work only with your teammates, and do not use external
            assistance or share answers with other teams. Follow the instructions
            of the event coordinators, respect fellow participants, and maintain a
            positive spirit throughout the challenge. Any form of cheating or
            misconduct may lead to disqualification. Good luck, and may your team
            be the first to unravel the Web of Secrets.
          </p>
        </div>
      </main>

      {/* Swing In Button — Bottom-right */}
      <Link
        id="swing-in-btn"
        href="/game"
        aria-label="Swing In — Enter the portal"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/play-button.png"
          alt="Swing In"
          className="swing-in-img"
        />
      </Link>
    </>
  );
}
