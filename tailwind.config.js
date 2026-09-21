/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}"],
  theme: {
    extend: {
      // The smallest phones (320–420px) now carry two builder cards per row and
      // a profile header with three controls on one line, so there is real work
      // to do below Tailwind's 640px `sm`. `xs` is an addition, not a
      // replacement: every default breakpoint is untouched.
      screens: {
        xs: "420px"
      },
      fontFamily: {
        inter: ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
