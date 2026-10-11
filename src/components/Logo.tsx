import { useId } from 'react'

/**
 * Знак приложения: входящее и исходящее сообщения — то, что делает чат.
 * Углы пузырей повторяют пузыри в переписке. Тот же рисунок — в public/favicon.svg.
 * Декоративный: рядом всегда есть текст с названием.
 */
export function Logo({ size = 64, className }: { size?: number; className?: string }) {
  const gradientId = useId()
  const tile = `url(#${gradientId})`
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#2f8bff" />
          <stop offset="1" stopColor="#0057d1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={tile} />
      <path
        d="M22 15H30A10 10 0 0 1 40 25A10 10 0 0 1 30 35H15A3 3 0 0 1 12 32V25A10 10 0 0 1 22 15Z"
        fill="#fff"
        fillOpacity={0.55}
      />
      <path
        d="M34 29H42A10 10 0 0 1 52 39V46A3 3 0 0 1 49 49H34A10 10 0 0 1 24 39A10 10 0 0 1 34 29Z"
        fill="#fff"
        stroke={tile}
        strokeWidth={5}
        paintOrder="stroke"
      />
    </svg>
  )
}
