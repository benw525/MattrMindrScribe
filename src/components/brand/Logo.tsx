import React from 'react';
interface LogoProps {
  size?: number;
  className?: string;
  variant?: 'mark' | 'full';
  inverted?: boolean;
}
export function Logo({
  size = 32,
  className = '',
  variant = 'mark',
  inverted = false
}: LogoProps) {
  const navy = '#0B1D3A';
  const bgColor = inverted ? 'white' : navy;
  const fgColor = inverted ? navy : 'white';
  const mark =
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={variant === 'mark' ? className : ''}>

      <rect width="48" height="48" rx="6" fill={bgColor} />
      {/* Left M leg */}
      <path
      d="M10 38V14L19 26L24 18"
      stroke={fgColor}
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none" />

      {/* Right M leg */}
      <path
      d="M38 38V14L29 26L24 18"
      stroke={fgColor}
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none" />

      {/* Center vertical accent */}
      <path
      d="M24 18V38"
      stroke={fgColor}
      strokeWidth="3.5"
      strokeLinecap="round"
      fill="none" />

    </svg>;

  if (variant === 'mark') return mark;
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {mark}
      <div className="flex items-baseline gap-0">
        <span
          className="font-semibold uppercase tracking-[0.14em] leading-none"
          style={{
            color: inverted ? 'white' : navy,
            fontSize: size * 0.44
          }}>

          MattrMindr
        </span>
        <span
          className="font-medium uppercase tracking-[0.14em] leading-none opacity-60"
          style={{
            color: inverted ? 'white' : navy,
            fontSize: size * 0.44
          }}>

          Scribe
        </span>
      </div>
    </div>);

}