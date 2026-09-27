# ftui-picker

*[English](#english) | [Deutsch](#deutsch)*

Ein Picker im iOS-Stil für **FHEM Tablet UI 3**. Uhrzeit, Datum, Zahlen und
Listen werden durch Scrollen nach oben und unten ausgewählt — mit
Endlos-Rädern, 3D-Neigung, Schnappen auf die Mitte und Touch-Schwung wie auf
dem iPhone.

![ftui-picker](docs/screenshot.png)

<a id="english"></a>

## English

`<ftui-picker>` is a wheel picker in the style of iOS for **FHEM Tablet UI 3**.
Values are chosen by scrolling up and down: endless wheels, tilted rows,
snapping to the centre and touch momentum, the way the iPhone does it.

It handles

* **times** — `hh:mm`, `hh:mm:ss`, any format you build yourself, with step
  widths such as five minutes
* **dates** — day, month and year in any order, with month names if you want
* **numbers** — from, to, step width, with a unit
* **lists** — entries of your own, for example operating modes

It scales with the FTUI classes `size-x` (`class="size-4"`) and writes the
selected value to the reading only after an **adjustable delay**, so that
scrolling through does not send every intermediate value to FHEM.

### Installation

#### With FHEM update (recommended)

In the FHEM command field:

```
update add https://raw.githubusercontent.com/chrisse1/fhem-ftui-components-picker/main/controls_ftuipicker.txt
update
```

`update add` remembers the control file in `FHEM/controls.txt`, and from then
on the picker is updated along with every `update`. FHEM does not have to be
restarted — only files below `www/` are installed. Reload the page in the
browser once with Ctrl+F5 so the new file does not come from the cache.

Useful variants:

```
update check                 shows what changed, without installing it
update list                  shows all registered control files
update delete https://raw.githubusercontent.com/chrisse1/fhem-ftui-components-picker/main/controls_ftuipicker.txt
```

Install it once without registering the control file for good:

```
update all https://raw.githubusercontent.com/chrisse1/fhem-ftui-components-picker/main/controls_ftuipicker.txt
```

What gets installed:

| File | What for |
|---|---|
| `www/ftui/components/picker/picker.component.js` | the component |
| `www/ftui/examples/picker.html` | example page |

#### By hand

Copying the single file does just as well:

```bash
cd /opt/fhem/www/ftui/components
mkdir -p picker
wget -O picker/picker.component.js \
  https://raw.githubusercontent.com/chrisse1/fhem-ftui-components-picker/main/www/ftui/components/picker/picker.component.js
```

Either way that is all there is to it — FTUI loads the component by itself as
soon as an `<ftui-picker>` appears on a page. Nothing has to be included or
registered.

### Quick start

```html
<!-- time, reads and writes the reading dummy1:time -->
<ftui-picker mode="time" [(value)]="dummy1:time"></ftui-picker>

<!-- date -->
<ftui-picker mode="date" [(value)]="Urlaub:start"></ftui-picker>

<!-- number with a unit, writes with a set command -->
<ftui-picker mode="number" min="5" max="30" step="0.5" unit="°C"
  [value]="Thermostat:desired-temp"
  (value)="set Thermostat desired-temp $value">
</ftui-picker>

<!-- list -->
<ftui-picker mode="list" list="Aus,Eco,Komfort,Party,Urlaub"
  [(value)]="Heizung:mode">
</ftui-picker>
```

### Modes (`mode`)

#### `mode="time"` — time of day

The default format is `hh:mm`. With `format` you can build any combination of
`hh`, `mm` and `ss` with separators of your choice.

```html
<ftui-picker mode="time" value="07:30"></ftui-picker>
<ftui-picker mode="time" format="hh:mm:ss" value="18:45:10"></ftui-picker>
<ftui-picker mode="time" format="hh Uhr mm" value="20 Uhr 15"></ftui-picker>

<!-- five minute steps only: 00, 05, 10 ... -->
<ftui-picker mode="time" minute-step="5" value="06:15"></ftui-picker>
```

The value is always padded to two digits, so `07:30`. Reading is forgiving:
`7:30`, `07:30:00` or `2026-09-26 07:30` are all understood (the numbers are
read in the order of the format).

#### `mode="date"` — day / month / year

The default format is `dd.mm.yyyy`. Available are `dd`, `mm`, `yyyy` and `yy`.

```html
<ftui-picker mode="date" value="24.12.2026"></ftui-picker>

<!-- ISO format, which makes the value ISO too: 2026-09-26 -->
<ftui-picker mode="date" format="yyyy-mm-dd" value="2026-09-26"></ftui-picker>

<!-- with month names, years limited to 2026..2030 -->
<ftui-picker mode="date" month-format="short" locale="de-DE"
  min-year="2026" max-year="2030" value="26.09.2026">
</ftui-picker>
```

The day wheel follows month and year by itself (28/29/30/31 days). Switching
from a 31 day month to February moves the day down to the 28th or 29th. The
**value** always carries the number of the month — `month-format` only changes
what is shown.

Without `min-year`/`max-year` the current year ±10 is offered.

#### `mode="number"` — numbers

```html
<ftui-picker mode="number" min="5" max="30" step="0.5" unit="°C" value="21.5"></ftui-picker>
<ftui-picker mode="number" min="0" max="100" step="5" unit="%" value="40"></ftui-picker>
<ftui-picker mode="number" min="1" max="12" pad="2" value="03"></ftui-picker>
```

The number of decimals follows from `step` (`step="0.5"` → one decimal) and can
be overridden with `decimals`. A value coming from outside is rounded to the
nearest step (`23.4` → `23.5`).

#### `mode="list"` — entries of your own

Like `ftui-dropdown`: `list` are the texts that are shown, `vallist`
optionally the values behind them.

```html
<ftui-picker mode="list" list="Aus,Eco,Komfort,Party" value="Eco"></ftui-picker>

<ftui-picker mode="list"
  list="Wohnzimmer,Küche,Schlafzimmer"
  vallist="living,kitchen,bedroom"
  [(value)]="Sonos:room">
</ftui-picker>

<!-- the list out of a reading -->
<ftui-picker mode="list" [list]="dummy4:setList" [(value)]="dummy4"></ftui-picker>
```

### Writing with a delay

Scrolling should not send every intermediate value to FHEM. The selected value
is therefore written only after an adjustable time.

The delay starts when you let go of the picker **and** the wheels stand still —
whichever of the two comes later:

* Let go with momentum and the wheel keeps gliding, and it starts only once
  the wheel stops. Otherwise an intermediate value would be written.
* Leave your finger resting after the drag, and it starts when you lift it.
* Reach for the picker again, and it is stopped and starts over on the next
  release.

It is always written once, with the value selected last — even when several
wheels were changed in between.

```html
<!-- default: 500 ms -->
<ftui-picker mode="time" [(value)]="dummy1:time"></ftui-picker>

<!-- write after three seconds -->
<ftui-picker mode="time" debounce="3000" [(value)]="dummy1:time"></ftui-picker>

<!-- "delay" is an alias of "debounce", in milliseconds as well -->
<ftui-picker mode="time" delay="2000" [(value)]="dummy1:time"></ftui-picker>

<!-- no delay: writes as soon as the wheel stands still, without waiting
     for the release -->
<ftui-picker mode="time" debounce="0" [(value)]="dummy1:time"></ftui-picker>
```

From 250 ms on, a thin progress bar along the bottom edge shows how long it
still takes — it therefore only starts running once you let go. `no-indicator`
switches it off.

While the delay runs and while you scroll, updates from FHEM are held back, so
that a wheel does not jump away under your finger. They are applied afterwards.

From JavaScript the delay can be cut short or dropped:

```js
document.querySelector('ftui-picker').submitNow();      // write right away
document.querySelector('ftui-picker').cancelPending();  // throw it away
```

### Size and appearance

Everything is laid out in `em` and therefore follows the font size of the
element. Every FTUI size class takes effect directly:

```html
<ftui-picker class="size--1" mode="time" value="12:00"></ftui-picker>
<ftui-picker class="size-0"  mode="time" value="12:00"></ftui-picker>
<ftui-picker class="size-2"  mode="time" value="12:00"></ftui-picker>
<ftui-picker class="size-4"  mode="time" value="12:00"></ftui-picker>
<ftui-picker class="size-6"  mode="time" value="12:00"></ftui-picker>
```

`rows` sets the number of visible rows (1 … 15):

```html
<ftui-picker mode="time" rows="3"></ftui-picker>
<ftui-picker mode="time" rows="7"></ftui-picker>
```

#### When space is tight

The selected row always sits in the middle of the picker. When the picker is
higher than the tile it lives in, the tile cuts it off at the bottom — and the
selection no longer looks centred but sits at the lower edge. The picker has to
become lower in that case.

`rows` takes even and fractional values for exactly that:

```html
<!-- two rows high: the selection in the middle, half a row peeking in
     above and below -->
<ftui-picker mode="time" rows="2"></ftui-picker>

<!-- the selected row alone, without neighbours -->
<ftui-picker mode="time" rows="1"></ftui-picker>

<!-- values in between work too -->
<ftui-picker mode="time" rows="2.5"></ftui-picker>
```

Or you leave it to the picker. With `rows="auto"` it takes the height its
surrounding element offers, but never more than `max-rows` (5 by default). If
that height changes later, it follows:

```html
<ftui-picker mode="time" rows="auto"></ftui-picker>
<ftui-picker mode="time" rows="auto" max-rows="7"></ftui-picker>
```

Everything else goes through CSS custom properties — they are inherited from
outside and can be set per picker, per page or in the theme:

| Property | What it does | Default |
|---|---|---|
| `--picker-color` | text colour | `var(--text-color)` |
| `--picker-item-height` | row height | `1.6em` |
| `--picker-wheel-width` | minimum width of a wheel | `1.8em` |
| `--picker-item-padding` | space left and right inside a wheel | `0.25em` |
| `--picker-separator-padding` | space around `:` and `.` | `0.05em` |
| `--picker-highlight-color` | the band in the middle | `rgba(128,128,128,0.2)` |
| `--picker-highlight-radius` | its corner radius | `0.4em` |
| `--picker-highlight-border` | lines above and below instead of a band | `none` |
| `--picker-selected-color` | colour of the selected entry | inherited |
| `--picker-font-weight` / `--picker-selected-font-weight` | font weight | inherited |
| `--picker-unit-color` / `--picker-unit-size` | the unit (`unit`) | inherited / `0.7em` |
| `--picker-pending-color` | progress bar of the delay | `var(--color-base)` |
| `--picker-focus-color` | focus ring (keyboard) | `var(--color-base)` |
| `--picker-mask` | fading at the edges, `none` switches it off | gradient |

An example — the iOS look with lines instead of a band:

```html
<ftui-picker mode="time"
  style="--picker-highlight-color: transparent;
         --picker-highlight-border: 1px solid var(--border-color);">
</ftui-picker>
```

`flat` switches off the 3D tilt (a flat list, a little easier on very slow
tablets):

```html
<ftui-picker mode="time" flat></ftui-picker>
```

### Attributes

| Attribute | Values | Default | Description |
|---|---|---|---|
| `value` | text | – | the selected value, in and out |
| `mode` | `time`, `date`, `number`, `list` | `time` | what is picked |
| `format` | e.g. `hh:mm`, `dd.mm.yyyy` | per mode | wheels and separators |
| `rows` | number 1 … 15 or `auto` | `5` | visible rows, even and fractional values allowed; `auto` follows the available height |
| `max-rows` | number 1 … 15 | `5` | upper limit for `rows="auto"` |
| `debounce` | ms | `500` | delay from the release until it is written |
| `delay` | ms | – | alias of `debounce` |
| `no-indicator` | – | off | hide the progress bar |
| `cyclic` | `true`/`false` | `true` | endless wheels for hours, minutes, seconds, day and month |
| `flat` | – | off | switch off the 3D tilt |
| `hour-step` | number | `1` | step width of the hours |
| `minute-step` | number | `1` | step width of the minutes |
| `second-step` | number | `1` | step width of the seconds |
| `min-year` / `max-year` | year | current year ±10 | range of the year wheel |
| `month-format` | `number`, `short`, `long` | `number` | how months are shown |
| `month-names` | 12 names, comma separated | – | month names of your own |
| `locale` | e.g. `de-DE` | browser | language of the month names |
| `min` / `max` / `step` | number | `0` / `100` / `1` | range for `mode="number"` |
| `decimals` | number | from `step` | decimal places |
| `pad` | number | `0` | pad numbers with leading zeros |
| `unit` | text | – | unit next to the wheel |
| `list` / `vallist` | comma separated | – | entries for `mode="list"` |
| `delimiter` | character | `,` | separator for `list`, `vallist`, `month-names` |
| `width` / `height` / `color` | CSS value | – | size and colour of the element |

On top of those the standard attributes of every FTUI component: `hidden`,
`disabled`, `readonly`, `margin`, `padding`.

### Events

| Event | When |
|---|---|
| `@value-change` | when the value is written, so after the delay |
| `@select` | right when a wheel comes to rest, before it is written |

```html
<ftui-picker mode="time"
  @select="console.log('selected: ' + $event.detail)"
  @value-change="console.log('written: ' + $event.detail)">
</ftui-picker>
```

### Touch, mouse and keyboard

* **Touch** — scroll and flick the way you do on the iPhone
* **Mouse** — the mouse wheel over a wheel, or a click on an entry, which then
  moves to the centre
* **Keyboard** — reach a wheel with Tab, then `↑` `↓` `PgUp` `PgDn` `Home` `End`

### Examples and demo

* `www/ftui/examples/picker.html` — example page for the FTUI installation
  (put it in `www/ftui/examples/` and open it in the browser)
* `demo/index.html` — runs without FHEM and without FTUI:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/demo/
```

The demo replaces the FTUI base class with `demo/ftui-element.stub.js` through
an import map. Inside FTUI none of that is needed.

### The control file for FHEM update

`controls_ftuipicker.txt` lists every installable file with its exact size and
a timestamp — FHEM downloads a file again only when one of the two changes, and
it aborts when a downloaded file does not have exactly the listed size. After
every change below `www/ftui/` it therefore has to be generated again:

```bash
./prepare_update.sh
```

The timestamp of unchanged files is kept, deleted files stay listed as
`MOV … unused` and therefore disappear from existing installations as well. You
can have it run automatically before every commit:

```bash
git config core.hooksPath .githooks
```

FHEM shows the file `CHANGED` as the release note during an update.

### Tests

The component is tested in a real Chromium — values, the delayed write,
endless wheels, leap years, scaling and the 3D rendering:

```bash
npm install playwright
npx playwright install chromium
node test/picker.test.mjs
```

### Browsers

Chrome/Chromium and Edge from 69, Firefox from 69, Safari and iOS from 13.1 as
well as the Android WebView of current tablets. It uses custom elements, shadow
DOM, CSS scroll snap and `ResizeObserver` — the same ground FTUI 3 itself
stands on.

### License

MIT — see [LICENSE](LICENSE).

<a id="deutsch"></a>

## Deutsch

`<ftui-picker>` ist ein Picker im iOS-Stil für **FHEM Tablet UI 3**. Werte
werden durch Scrollen nach oben und unten ausgewählt — mit Endlos-Rädern,
3D-Neigung, Schnappen auf die Mitte und Touch-Schwung wie auf dem iPhone.

Der Picker kann

* **Uhrzeiten** — `hh:mm`, `hh:mm:ss`, beliebige Formate, auch mit
  5-Minuten-Schritten
* **Datum** — Tag, Monat, Jahr in beliebiger Reihenfolge, wahlweise mit
  Monatsnamen
* **Zahlen** — von/bis/Schrittweite, mit Einheit
* **Listen** — frei definierte Einträge (z. B. Betriebsmodi)

Er skaliert vollständig über die FTUI-Klassen `size-x` (`class="size-4"`) und
schreibt den ausgewählten Wert erst nach einer **einstellbaren Verzögerung**
ins Reading, damit beim Durchscrollen nicht jeder Zwischenwert an FHEM geht.

### Installation

#### Über FHEM update (empfohlen)

Im FHEM-Kommandofeld:

```
update add https://raw.githubusercontent.com/chrisse1/fhem-ftui-components-picker/main/controls_ftuipicker.txt
update
```

`update add` merkt sich die Kontrolldatei in `FHEM/controls.txt`, ab dann wird
der Picker bei jedem `update` mit aktualisiert. Ein Neustart von FHEM ist nicht
nötig — es werden nur Dateien unter `www/` installiert. Im Browser einmal mit
Strg+F5 neu laden, damit die neue Datei nicht aus dem Cache kommt.

Nützliche Varianten:

```
update check                 zeigt, was sich geändert hat, ohne es zu installieren
update list                  zeigt alle eingetragenen Kontrolldateien
update delete https://raw.githubusercontent.com/chrisse1/fhem-ftui-components-picker/main/controls_ftuipicker.txt
```

Einmalig installieren, ohne die Kontrolldatei dauerhaft einzutragen:

```
update all https://raw.githubusercontent.com/chrisse1/fhem-ftui-components-picker/main/controls_ftuipicker.txt
```

Installiert werden:

| Datei | Zweck |
|---|---|
| `www/ftui/components/picker/picker.component.js` | die Komponente |
| `www/ftui/examples/picker.html` | Beispielseite |

#### Von Hand

Genauso gut kann man die eine Datei direkt kopieren:

```bash
cd /opt/fhem/www/ftui/components
mkdir -p picker
wget -O picker/picker.component.js \
  https://raw.githubusercontent.com/chrisse1/fhem-ftui-components-picker/main/www/ftui/components/picker/picker.component.js
```

In beiden Fällen ist damit alles erledigt — FTUI lädt die Komponente
automatisch, sobald ein `<ftui-picker>` auf der Seite steht. Es muss nichts
eingebunden oder registriert werden.

### Schnellstart

```html
<!-- Uhrzeit, liest und schreibt das Reading dummy1:time -->
<ftui-picker mode="time" [(value)]="dummy1:time"></ftui-picker>

<!-- Datum -->
<ftui-picker mode="date" [(value)]="Urlaub:start"></ftui-picker>

<!-- Zahl mit Einheit, schreibt per set-Befehl -->
<ftui-picker mode="number" min="5" max="30" step="0.5" unit="°C"
  [value]="Thermostat:desired-temp"
  (value)="set Thermostat desired-temp $value">
</ftui-picker>

<!-- Liste -->
<ftui-picker mode="list" list="Aus,Eco,Komfort,Party,Urlaub"
  [(value)]="Heizung:mode">
</ftui-picker>
```

### Betriebsarten (`mode`)

#### `mode="time"` — Uhrzeit

Standardformat ist `hh:mm`. Über `format` lässt sich jede Kombination aus
`hh`, `mm` und `ss` mit beliebigen Trennzeichen bauen.

```html
<ftui-picker mode="time" value="07:30"></ftui-picker>
<ftui-picker mode="time" format="hh:mm:ss" value="18:45:10"></ftui-picker>
<ftui-picker mode="time" format="hh Uhr mm" value="20 Uhr 15"></ftui-picker>

<!-- nur 5-Minuten-Schritte: 00, 05, 10 ... -->
<ftui-picker mode="time" minute-step="5" value="06:15"></ftui-picker>
```

Der Wert ist immer zweistellig aufgefüllt, also `07:30`. Beim Lesen ist der
Picker tolerant: `7:30`, `07:30:00` oder `2026-09-26 07:30` werden korrekt
übernommen (es werden die Zahlen in der Reihenfolge des Formats gelesen).

#### `mode="date"` — Tag / Monat / Jahr

Standardformat ist `dd.mm.yyyy`. Möglich sind `dd`, `mm`, `yyyy` und `yy`.

```html
<ftui-picker mode="date" value="24.12.2026"></ftui-picker>

<!-- ISO-Format, dadurch ist auch der Wert ISO: 2026-09-26 -->
<ftui-picker mode="date" format="yyyy-mm-dd" value="2026-09-26"></ftui-picker>

<!-- mit Monatsnamen, Jahre auf 2026..2030 begrenzt -->
<ftui-picker mode="date" month-format="short" locale="de-DE"
  min-year="2026" max-year="2030" value="26.09.2026">
</ftui-picker>
```

Das Tages-Rad passt sich automatisch an Monat und Jahr an (28/29/30/31 Tage).
Wird von einem 31-Tage-Monat in den Februar gewechselt, rutscht der Tag auf
den 28. bzw. 29. Der **Wert** enthält immer die Monatszahl — `month-format`
ändert nur die Anzeige.

Ohne `min-year`/`max-year` wird das aktuelle Jahr ±10 angeboten.

#### `mode="number"` — Zahlen

```html
<ftui-picker mode="number" min="5" max="30" step="0.5" unit="°C" value="21.5"></ftui-picker>
<ftui-picker mode="number" min="0" max="100" step="5" unit="%" value="40"></ftui-picker>
<ftui-picker mode="number" min="1" max="12" pad="2" value="03"></ftui-picker>
```

Die Nachkommastellen ergeben sich aus `step` (`step="0.5"` → eine
Nachkommastelle) und lassen sich mit `decimals` überschreiben. Ein Wert von
außen wird auf den nächstgelegenen Schritt gerundet (`23.4` → `23.5`).

#### `mode="list"` — eigene Einträge

Wie bei `ftui-dropdown`: `list` sind die angezeigten Texte, `vallist`
optional die dazugehörigen Werte.

```html
<ftui-picker mode="list" list="Aus,Eco,Komfort,Party" value="Eco"></ftui-picker>

<ftui-picker mode="list"
  list="Wohnzimmer,Küche,Schlafzimmer"
  vallist="living,kitchen,bedroom"
  [(value)]="Sonos:room">
</ftui-picker>

<!-- Liste aus einem Reading -->
<ftui-picker mode="list" [list]="dummy4:setList" [(value)]="dummy4"></ftui-picker>
```

### Verzögertes Schreiben (Delay)

Beim Scrollen soll nicht jeder Zwischenwert an FHEM gehen. Deshalb wird der
ausgewählte Wert erst nach einer einstellbaren Zeit geschrieben.

Die Wartezeit beginnt, wenn man den Picker loslässt **und** die Räder
stillstehen — also beim späteren der beiden Ereignisse:

* Lässt man mit Schwung los und das Rad rollt noch aus, beginnt sie erst,
  wenn es steht. Sonst würde ein Zwischenwert geschrieben.
* Bleibt der Finger nach dem Ziehen liegen, beginnt sie erst beim Abheben.
* Greift man nach, wird sie gestoppt und startet beim nächsten Loslassen
  von vorn.

Geschrieben wird immer nur einmal, mit dem zuletzt ausgewählten Wert — auch
wenn zwischendurch mehrere Räder verstellt wurden.

```html
<!-- Standard: 500 ms -->
<ftui-picker mode="time" [(value)]="dummy1:time"></ftui-picker>

<!-- erst nach 3 Sekunden schreiben -->
<ftui-picker mode="time" debounce="3000" [(value)]="dummy1:time"></ftui-picker>

<!-- "delay" ist ein Alias für "debounce", ebenfalls in Millisekunden -->
<ftui-picker mode="time" delay="2000" [(value)]="dummy1:time"></ftui-picker>

<!-- ohne Verzögerung: schreibt, sobald das Rad steht, ohne aufs
     Loslassen zu warten -->
<ftui-picker mode="time" debounce="0" [(value)]="dummy1:time"></ftui-picker>
```

Ab 250 ms zeigt ein dünner Fortschrittsbalken am unteren Rand an, wie lange es
noch bis zum Schreiben dauert — er läuft also erst ab dem Loslassen. Mit
`no-indicator` lässt er sich abschalten.

Während der Wartezeit und während des Scrollens werden Updates aus FHEM
zurückgehalten, damit einem das Rad nicht unter dem Finger wegspringt. Sie
werden danach automatisch nachgeholt.

Per JavaScript kann man die Wartezeit abkürzen oder abbrechen:

```js
document.querySelector('ftui-picker').submitNow();      // sofort schreiben
document.querySelector('ftui-picker').cancelPending();  // verwerfen
```

### Größe und Aussehen

Die gesamte Darstellung ist in `em` aufgebaut und richtet sich damit nach der
Schriftgröße des Elements. Jede FTUI-Größenklasse wirkt also direkt:

```html
<ftui-picker class="size--1" mode="time" value="12:00"></ftui-picker>
<ftui-picker class="size-0"  mode="time" value="12:00"></ftui-picker>
<ftui-picker class="size-2"  mode="time" value="12:00"></ftui-picker>
<ftui-picker class="size-4"  mode="time" value="12:00"></ftui-picker>
<ftui-picker class="size-6"  mode="time" value="12:00"></ftui-picker>
```

Die Anzahl der sichtbaren Zeilen steuert `rows` (1 … 15):

```html
<ftui-picker mode="time" rows="3"></ftui-picker>
<ftui-picker mode="time" rows="7"></ftui-picker>
```

#### Wenn der Platz knapp ist

Die ausgewählte Zeile sitzt immer in der Mitte des Pickers. Ist der Picker
höher als die Kachel, in der er steckt, schneidet die Kachel ihn unten ab —
und die Auswahl steht dann optisch nicht mehr mittig, sondern am unteren Rand.
Der Picker muss in diesem Fall also niedriger werden.

`rows` nimmt dafür auch gerade und gebrochene Werte an:

```html
<!-- zwei Zeilen hoch: die Auswahl in der Mitte, darüber und darunter
     schaut je eine halbe Zeile hervor -->
<ftui-picker mode="time" rows="2"></ftui-picker>

<!-- nur die ausgewählte Zeile, ohne Nachbarn -->
<ftui-picker mode="time" rows="1"></ftui-picker>

<!-- Zwischenwerte gehen auch -->
<ftui-picker mode="time" rows="2.5"></ftui-picker>
```

Oder man überlässt es dem Picker. Mit `rows="auto"` nimmt er die Höhe, die
ihm sein umgebendes Element lässt, höchstens aber `max-rows` (Standard 5).
Ändert sich die Höhe später, passt er sich an:

```html
<ftui-picker mode="time" rows="auto"></ftui-picker>
<ftui-picker mode="time" rows="auto" max-rows="7"></ftui-picker>
```

Alles Weitere über CSS-Variablen — sie werden von außen vererbt und lassen
sich pro Picker, pro Seite oder im Theme setzen:

| Variable | Bedeutung | Standard |
|---|---|---|
| `--picker-color` | Textfarbe | `var(--text-color)` |
| `--picker-item-height` | Zeilenhöhe | `1.6em` |
| `--picker-wheel-width` | Mindestbreite eines Rades | `1.8em` |
| `--picker-item-padding` | Abstand links/rechts im Rad | `0.25em` |
| `--picker-separator-padding` | Abstand um `:` bzw. `.` | `0.05em` |
| `--picker-highlight-color` | Balken in der Mitte | `rgba(128,128,128,0.2)` |
| `--picker-highlight-radius` | dessen Eckenradius | `0.4em` |
| `--picker-highlight-border` | statt Balken z. B. Linien oben/unten | `none` |
| `--picker-selected-color` | Farbe des ausgewählten Eintrags | geerbt |
| `--picker-font-weight` / `--picker-selected-font-weight` | Schriftstärke | geerbt |
| `--picker-unit-color` / `--picker-unit-size` | Einheit (`unit`) | geerbt / `0.7em` |
| `--picker-pending-color` | Fortschrittsbalken der Verzögerung | `var(--color-base)` |
| `--picker-focus-color` | Fokusrahmen (Tastatur) | `var(--color-base)` |
| `--picker-mask` | Ausblenden an den Rändern, `none` schaltet es ab | Verlauf |

Beispiel — iOS-Optik mit Linien statt Balken:

```html
<ftui-picker mode="time"
  style="--picker-highlight-color: transparent;
         --picker-highlight-border: 1px solid var(--border-color);">
</ftui-picker>
```

Mit `flat` wird die 3D-Neigung abgeschaltet (flache Liste, etwas sparsamer auf
sehr langsamen Tablets):

```html
<ftui-picker mode="time" flat></ftui-picker>
```

### Attribute

| Attribut | Werte | Standard | Beschreibung |
|---|---|---|---|
| `value` | Text | – | ausgewählter Wert, Ein- und Ausgabe |
| `mode` | `time`, `date`, `number`, `list` | `time` | Betriebsart |
| `format` | z. B. `hh:mm`, `dd.mm.yyyy` | je Modus | Räder und Trennzeichen |
| `rows` | Zahl 1 … 15 oder `auto` | `5` | sichtbare Zeilen, gerade und gebrochene Werte erlaubt; `auto` passt sich an die verfügbare Höhe an |
| `max-rows` | Zahl 1 … 15 | `5` | Obergrenze für `rows="auto"` |
| `debounce` | ms | `500` | Verzögerung ab dem Loslassen bis zum Schreiben |
| `delay` | ms | – | Alias für `debounce` |
| `no-indicator` | – | aus | Fortschrittsbalken ausblenden |
| `cyclic` | `true`/`false` | `true` | Endlos-Räder für Stunden, Minuten, Sekunden, Tag und Monat |
| `flat` | – | aus | 3D-Neigung abschalten |
| `hour-step` | Zahl | `1` | Schrittweite der Stunden |
| `minute-step` | Zahl | `1` | Schrittweite der Minuten |
| `second-step` | Zahl | `1` | Schrittweite der Sekunden |
| `min-year` / `max-year` | Jahr | aktuelles Jahr ±10 | Bereich des Jahres-Rades |
| `month-format` | `number`, `short`, `long` | `number` | Anzeige der Monate |
| `month-names` | 12 Namen, kommagetrennt | – | eigene Monatsnamen |
| `locale` | z. B. `de-DE` | Browser | Sprache der Monatsnamen |
| `min` / `max` / `step` | Zahl | `0` / `100` / `1` | Bereich bei `mode="number"` |
| `decimals` | Zahl | aus `step` | Nachkommastellen |
| `pad` | Zahl | `0` | Zahlen mit Nullen auffüllen |
| `unit` | Text | – | Einheit rechts neben dem Rad |
| `list` / `vallist` | kommagetrennt | – | Einträge bei `mode="list"` |
| `delimiter` | Zeichen | `,` | Trennzeichen für `list`, `vallist`, `month-names` |
| `width` / `height` / `color` | CSS-Wert | – | Größe und Farbe des Elements |

Dazu die Standard-Attribute jeder FTUI-Komponente: `hidden`, `disabled`,
`readonly`, `margin`, `padding`.

### Ereignisse

| Ereignis | wann |
|---|---|
| `@value-change` | wenn der Wert geschrieben wird, also nach der Verzögerung |
| `@select` | sofort beim Stehenbleiben eines Rades, noch vor dem Schreiben |

```html
<ftui-picker mode="time"
  @select="console.log('ausgewählt: ' + $event.detail)"
  @value-change="console.log('geschrieben: ' + $event.detail)">
</ftui-picker>
```

### Touch, Maus und Tastatur

* **Touch** — scrollen und schwungvoll wischen wie auf dem iPhone
* **Maus** — Mausrad über dem Rad, oder Klick auf einen Eintrag, der dann in
  die Mitte rückt
* **Tastatur** — Rad mit Tab anspringen, dann `↑` `↓` `Bild↑` `Bild↓` `Pos1` `Ende`

### Beispiele und Demo

* `www/ftui/examples/picker.html` — Beispielseite für die FTUI-Installation
  (in `www/ftui/examples/` ablegen und im Browser öffnen)
* `demo/index.html` — läuft ohne FHEM und ohne FTUI:

```bash
python3 -m http.server 8000
# danach http://localhost:8000/demo/ öffnen
```

Die Demo ersetzt die FTUI-Basisklasse über eine Import-Map durch
`demo/ftui-element.stub.js`. In FTUI selbst wird davon nichts gebraucht.

### Kontrolldatei für FHEM update

`controls_ftuipicker.txt` listet jede installierbare Datei mit exakter Größe
und Zeitstempel — FHEM lädt eine Datei erst neu, wenn sich eines von beidem
ändert, und bricht ab, wenn die heruntergeladene Datei nicht exakt die
angegebene Größe hat. Nach jeder Änderung unterhalb von `www/ftui/` muss sie
deshalb neu erzeugt werden:

```bash
./prepare_update.sh
```

Der Zeitstempel unveränderter Dateien bleibt dabei erhalten, gelöschte Dateien
bleiben als `MOV … unused` stehen und verschwinden dadurch auch aus bestehenden
Installationen. Wer möchte, lässt das automatisch vor jedem Commit laufen:

```bash
git config core.hooksPath .githooks
```

Die Datei `CHANGED` zeigt FHEM beim Update als Änderungshinweis an.

### Tests

Die Komponente wird in einem echten Chromium getestet — Werte, verzögertes
Schreiben, Endlos-Räder, Schalttage, Skalierung und 3D-Darstellung:

```bash
npm install playwright
npx playwright install chromium
node test/picker.test.mjs
```

### Browser

Chrome/Chromium und Edge ab 69, Firefox ab 69, Safari und iOS ab 13.1 sowie
die Android-WebView aktueller Tablets. Verwendet werden Custom Elements,
Shadow DOM, CSS Scroll Snap und `ResizeObserver` — dieselbe Basis, auf der
auch FTUI 3 aufbaut.

### Lizenz

MIT — siehe [LICENSE](LICENSE).
