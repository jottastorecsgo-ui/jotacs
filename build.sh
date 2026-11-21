set -eu

SALIDA="dist"
PAGINAS="index.html comprar.html vender.html sorteos.html battle-pass.html faq.html mi-cuenta.html admin.html 404.html"
SUELTOS="_headers _redirects robots.txt sitemap.xml"

case "$SALIDA" in dist) ;; *) echo "salida inesperada"; exit 1 ;; esac
[ -d "$SALIDA" ] && find "$SALIDA" -mindepth 1 -delete
mkdir -p "$SALIDA"

for f in $PAGINAS $SUELTOS; do
  [ -f "$f" ] || { echo "falta $f"; exit 1; }
  cp "$f" "$SALIDA/$f"
done
cp -R assets "$SALIDA/assets"

if [ -n "$(find "$SALIDA" -type l)" ]; then echo "hay enlaces simbolicos"; exit 1; fi

SOBRAN="$(find "$SALIDA" -type f ! -name '*.html' ! -name '*.js' ! -name '*.css' ! -name '*.json' \
  ! -name '*.webp' ! -name '*.jpg' ! -name '*.jpeg' ! -name '*.png' \
  ! -name '_headers' ! -name '_redirects' ! -name 'robots.txt' ! -name 'sitemap.xml')"
if [ -n "$SOBRAN" ]; then echo "archivos que no deberian publicarse:"; echo "$SOBRAN"; exit 1; fi

for prohibido in functions lib scripts config .github .git node_modules; do
  if [ -e "$SALIDA/$prohibido" ]; then echo "no se publica $prohibido"; exit 1; fi
done

if grep -rIlE -e '-----BEGIN [A-Z ]*PRIVATE KEY' -e '"private_key"' -e '[0-9]{8,10}:[A-Za-z0-9_-]{35}' "$SALIDA" >/dev/null 2>&1; then
  echo "hay una credencial en lo que se iba a publicar"; exit 1
fi

echo "listo: $(find "$SALIDA" -type f | wc -l) archivos en $SALIDA"
