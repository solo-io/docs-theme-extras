{{- $md := partial "page-to-markdown.html" . -}}
{{- $llmsHref := partial "utils/llms-href.html" . -}}
> {{ with $llmsHref }}For the complete documentation index, see [llms.txt]({{ . }}). {{ end }}Markdown versions of all docs pages are available by appending .md to any docs URL.

# {{ .Title | replaceRE "\n" " " }}
{{- /* The front matter description renders on the HTML page as the lead
       paragraph (`.page-description`, see docs/single.html), so it belongs in
       the .md twin too. Without it, agents reading the .md lose the one-line
       summary, and afdocs `markdown-content-parity` reports it as missing. */ -}}
{{ with .Description }}

{{ . | replaceRE "\n" " " | strings.TrimSpace }}{{ end }}

{{ $md }}
