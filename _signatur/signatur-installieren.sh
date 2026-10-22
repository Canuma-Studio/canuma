#!/bin/bash
# Ersetzt die zuletzt angelegte Apple-Mail-Signatur durch die gestaltete Canuma-Signatur.
# Vorher in Mail eine Signatur namens "Canuma" anlegen (Inhalt egal).
set -e
HIER="$(cd "$(dirname "$0")" && pwd)"
BODY="$HIER/signatur-body.html"

echo "Mail wird beendet ..."
osascript -e 'quit app "Mail"' || true
sleep 3

# Signaturen liegen je nach iCloud-Einstellung an einem von zwei Orten – die neueste Datei nehmen
DATEI=$(ls -t ~/Library/Mobile\ Documents/com~apple~mail/Data/*/MailData/Signatures/*.mailsignature \
              ~/Library/Mail/V*/MailData/Signatures/*.mailsignature 2>/dev/null | head -1)
if [ -z "$DATEI" ]; then
  echo "Keine Signatur-Datei gefunden. Hat Terminal Festplattenvollzugriff?"; exit 1
fi
echo "Gefunden: $DATEI"

cp "$DATEI" ~/Desktop/signatur-backup.mailsignature
chflags nouchg "$DATEI" 2>/dev/null || true

# Kopfzeilen der Datei behalten (bis zur ersten Leerzeile), Inhalt ersetzen
python3 - "$DATEI" "$BODY" <<'PY'
import sys
f, body = sys.argv[1], open(sys.argv[2], encoding='ascii').read()
raw = open(f, encoding='utf-8', errors='ignore').read().replace('\r\n', '\n')
kopf = raw.split('\n\n', 1)[0]
open(f, 'w', encoding='ascii').write(kopf + '\n\n' + body)
PY

# Datei schützen, damit Mail sie nicht wieder überschreibt
chflags uchg "$DATEI"
echo "Fertig. Mail wird wieder geöffnet."
open -a Mail
