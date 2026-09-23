# canuma.ch – Stand

## Projekt
- Website der Firma Canuma Studio (Philipp März, Zürich)
- Repo: https://github.com/Canuma-Studio/canuma
- Domain: canuma.ch (Hostpoint), Mail: info@canuma.ch (Hostpoint Cloud Office Basic)
- Aufbau wie Scoff: index.html, styles.css, script.js, images/, fonts/

## Erledigt
- 23.09.2026: Projektordner angelegt, mit GitHub verknüpft, Platzhalter-Startseite

- 23.09.2026: Design gewählt (Entwurf F "Zerbrechen") und als Startseite übernommen, alte Entwürfe gelöscht
- 24.09.2026: impressum.html + datenschutz.html (DSG, GitHub Pages + Hostpoint-Mail, keine Cookies), Footer-Links verknüpft
- 24.09.2026: Privatadresse aus Impressum entfernt; Studio-Text branchenoffen; Projekte als Reiter statt Filmstreifen (ChefKlick-Handy im echten hellen App-Design mit Beispieldaten, scrollt zum Monatsring, Webseiten: Skizze → Gestaltung → Handy, Fotografie: Kamera-Sucher mit Platzhaltern)
- 24.09.2026: ChefKlick-Handy frei auf Beige (ohne dunkle Fläche); Fotografie: eigener Teller (images/foto/teller.webp, freigestellt, Original in images/original/) auf Schwarz, Sucher stellt scharf, blitzt, Teller dreht sich langsam

## Design
- Hintergrund überall helles Beige #eee8dd, alle Elemente Anthrazit #1c1c1c
- Hausschrift TeX Gyre Adventor (fonts/), Fliesstext Systemschrift, Labels Monospace
- Logo wird in script.js als Vektor auf ein Canvas gezeichnet: Maus drüber -> zerbricht in Stücke,
  die kurz schweben und zurückfedern (Tempo: "pull" und "damp" in script.js)
- Scroll: Kamera fliegt durch die Lücke zwischen Ring und Punkt ins Beige, dort der Studio-Text
- Handy: Antippen lässt das Logo zerspringen (Klick auf Desktop ebenso)
- Studio-Überschrift setzt sich beim Scrollen aus Scherben zusammen (drawShards in script.js)
- Projekte: drei Reiter (Pfeiltasten gehen auch); Vorschauen laufen nur, wenn sichtbar
- ChefKlick-Link: in index.html vorbereitet (Kommentar), sobald chefklick.ch online ist
- Foto-Reiter: Bild in images/foto/; beim Übertragen auf den Mac hängt sich ein C2PA-Block an – entfernen und md5 prüfen
- Kontakt: Zürcher Uhrzeit live, Mail-Adresse wird vom Cursor angezogen
- Texte sind noch Platzhalter

## Nächste Schritte
1. Texte schreiben (Studio, Projekte, Kontakt)
2. GitHub Pages aktivieren, canuma.ch per DNS bei Hostpoint verbinden (Nameserver NICHT ändern, sonst geht die Mail nicht mehr)
3. Später: SPF/DKIM prüfen, falls Mails im Spam landen
