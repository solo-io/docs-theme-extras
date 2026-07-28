{{- $md := partial "page-to-markdown.html" . -}}
{{- $llmsHref := partial "utils/llms-href.html" . -}}
> {{ with $llmsHref }}For the complete documentation index, see [llms.txt]({{ . }}). {{ end }}Markdown versions of all docs pages are available by appending .md to any docs URL.

# {{ .Title | replaceRE "\n" " " }}

{{ $md }}
