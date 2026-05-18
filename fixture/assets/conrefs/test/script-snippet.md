MARKER_SCRIPTREUSE_PROSE. A snippet whose body emits inline `<script>` tags
(both a one-line script with attributes and a multi-line script tag where
attributes wrap across newlines). Mimics docs-hub's render.html and
openapi.html templates that emit inline `<script>` elements with
content.

<script>const MARKER_SCRIPTREUSE_SINGLELINE = 'reusable inline script body';</script>

<script
  src="https://example.com/MARKER_SCRIPTREUSE_MULTILINE.js"
  integrity="sha256-abc123"
  crossorigin="anonymous"></script>

<script>
  document.addEventListener('DOMContentLoaded', function() {
    // MARKER_SCRIPTREUSE_LISTENER body. Multi-line script body with code
    // that Hugo minifier would reject if the reuse template injected
    // HTML entities in place of newlines inside this raw script content.
    var el = document.getElementById('marker');
    if (el) { el.dataset.body = 'ok'; }
  });
</script>

MARKER_SCRIPTREUSE_TAIL. Trailing prose after the scripts.
