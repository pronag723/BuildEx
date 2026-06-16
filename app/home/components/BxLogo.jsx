/**
 * BX brand mark — an isometric green cube with $ engraved on the top face,
 * B on the left face, and X on the right face. Rendered inline (no asset
 * request, no basePath handling) so it stays crisp at any size. Size it with
 * the `className` prop (e.g. "w-9 h-9"); it fills its box.
 */
export default function BxLogo({ className = "", title = "BX" }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient
          id="bxlogo-top"
          x1="256"
          y1="96"
          x2="256"
          y2="256"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#33df6c" />
          <stop offset="1" stopColor="#28c95d" />
        </linearGradient>
        <linearGradient
          id="bxlogo-left"
          x1="96"
          y1="176"
          x2="256"
          y2="424"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#23bf55" />
          <stop offset="1" stopColor="#1ba249" />
        </linearGradient>
        <linearGradient
          id="bxlogo-right"
          x1="416"
          y1="176"
          x2="256"
          y2="424"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#1da044" />
          <stop offset="1" stopColor="#15883b" />
        </linearGradient>

        <g id="bxlogo-glyph-b">
          <rect x="28" y="18" width="14" height="64" />
          <rect x="28" y="18" width="34" height="13" />
          <rect x="28" y="44" width="34" height="12" />
          <rect x="28" y="69" width="38" height="13" />
          <rect x="52" y="18" width="14" height="38" />
          <rect x="54" y="44" width="14" height="38" />
        </g>
        <g id="bxlogo-glyph-x">
          <path d="M24 16 H40 L76 84 H60 Z" />
          <path d="M60 16 H76 L40 84 H24 Z" />
        </g>
        <g id="bxlogo-glyph-d">
          <rect x="28" y="18" width="44" height="13" />
          <rect x="28" y="18" width="13" height="30" />
          <rect x="28" y="44" width="44" height="13" />
          <rect x="59" y="44" width="13" height="30" />
          <rect x="28" y="69" width="44" height="13" />
          <rect x="46" y="8" width="9" height="84" />
        </g>
      </defs>

      <path
        d="M256 96 L416 176 L416 344 L256 424 L96 344 L96 176 Z"
        fill="#23bf55"
      />
      <path d="M256 96 L416 176 L256 256 L96 176 Z" fill="url(#bxlogo-top)" />
      <path d="M96 176 L256 256 L256 424 L96 344 Z" fill="url(#bxlogo-left)" />
      <path
        d="M256 256 L416 176 L416 344 L256 424 Z"
        fill="url(#bxlogo-right)"
      />

      <g transform="matrix(1.6,0.8,-1.6,0.8,256,96)">
        <use href="#bxlogo-glyph-d" fill="#62ec8d" transform="translate(1.2,2.6)" />
        <use href="#bxlogo-glyph-d" fill="#1ba94f" />
      </g>
      <g transform="matrix(1.6,0.8,0,1.68,96,176)">
        <use href="#bxlogo-glyph-b" fill="#4ed873" transform="translate(1.2,2.6)" />
        <use href="#bxlogo-glyph-b" fill="#13923f" />
      </g>
      <g transform="matrix(1.6,-0.8,0,1.68,256,256)">
        <use href="#bxlogo-glyph-x" fill="#40c564" transform="translate(1.2,2.6)" />
        <use href="#bxlogo-glyph-x" fill="#0e7a33" />
      </g>
    </svg>
  );
}
