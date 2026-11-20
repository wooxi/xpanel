import React from 'react';

interface BrandLogoProps {
  size?: number;
}

/** 黑白简约线条风格几何 Logo */
export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 32 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'block', flexShrink: 0 }}
  >
    <rect x="1" y="1" width="30" height="30" rx="7.5" fill="#111111" />
    <rect
      x="4.5"
      y="4.5"
      width="23"
      height="23"
      rx="4.5"
      stroke="#FFFFFF"
      strokeOpacity="0.24"
      strokeWidth="1"
    />
    <path
      d="M10.5 10.5L21.5 21.5M21.5 10.5L10.5 21.5"
      stroke="#FFFFFF"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <circle cx="16" cy="16" r="2.3" fill="#111111" stroke="#FFFFFF" strokeWidth="1.4" />
  </svg>
);
