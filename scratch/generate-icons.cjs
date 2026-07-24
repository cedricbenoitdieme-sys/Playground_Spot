const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SRC_SVG = path.join(ROOT, 'logo', 'logo PS.svg');
const OUT_DIR = path.join(ROOT, 'public', 'icons');
const BG = '#0f4c2a'; // même couleur que meta theme-color / body background-color

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Logo à ~72% de la zone, centré sur fond de marque plein (évite un logo
// coupé par le masque circulaire/arrondi qu'Android applique aux icônes
// adaptatives, et donne un rendu propre sur iOS qui n'applique aucun masque).
async function makeIcon(size) {
  const logoSize = Math.round(size * 0.72);

  // Le SVG source n'a pas de viewBox et son contenu réel n'occupe pas tout
  // le canvas déclaré (490x509) — un simple resize/contain le laisse décalé
  // dans un coin. On rend en haute résolution puis on rogne (trim) les
  // marges transparentes pour isoler le vrai ballon avant de le centrer.
  const rendered = await sharp(SRC_SVG, { density: 384 }).png().toBuffer();
  const trimmed = await sharp(rendered).trim().toBuffer();
  const logoBuffer = await sharp(trimmed)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const offset = Math.round((size - logoSize) / 2);

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG }
  })
    .composite([{ input: logoBuffer, left: offset, top: offset }])
    .png()
    .toFile(path.join(OUT_DIR, `icon-${size}.png`));

  console.log(`OK icon-${size}.png`);
}

(async () => {
  for (const size of [180, 192, 512]) {
    await makeIcon(size);
  }
})();
