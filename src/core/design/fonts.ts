// Self-hosted fonts (no Google Fonts request).
// Archivo with the width axis, so headings can use font-stretch: 125% (extended). Archivo has no
// Cyrillic: Kazakh/Russian words in headings fall back to Manrope (see --font-display).
// Manrope ships cyrillic + cyrillic-ext, which covers Kazakh (Ә Ғ Қ Ң Ө Ұ Ү Һ І) and Russian.
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/manrope/wght.css';
