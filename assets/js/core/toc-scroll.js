// Intentional empty override. The docs repo ships its own TOC scroll-spy
// in layouts/partials/custom/head-end.html (uses requestAnimationFrame +
// a single class swap so background-color and text-color always paint in
// the same frame). Hextra's version uses IntersectionObserver and a
// separate class (hextra-toc-active), which fires at a different time and
// causes the two properties to stagger visually.
