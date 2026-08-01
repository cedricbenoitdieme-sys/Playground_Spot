// UnitechPay attend un numéro sénégalais au format local 9 chiffres
// (7XXXXXXXX) — un numéro saisi au format international (+221 77 123 45 67,
// 00221771234567) doit être normalisé avant l'appel, pas simplement rejeté.
export function normalizeSenegalPhone(raw) {
  let p = String(raw || '').replace(/\D/g, '');
  if (p.startsWith('00221')) p = p.slice(5);
  else if (p.startsWith('221')) p = p.slice(3);
  if (!/^7[0-9]{8}$/.test(p)) {
    throw new Error('Numéro invalide : format attendu 7XXXXXXXX');
  }
  return p;
}
