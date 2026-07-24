/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Utilitaire d'Exportation PDF & CSV
 * Rapports Financiers, Télémétrie & Reçus Officiels
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Exporte un tableau de données sous forme de fichier CSV encodé en UTF-8 (AVEC BOM Excel)
 * @param {string} filename - Nom du fichier (ex: 'rapport_revenus_mai_2026.csv')
 * @param {Array<string>} headers - Entêtes de colonnes ex: ['Date', 'Terrain', 'Joueur', 'Montant FCFA', 'Statut']
 * @param {Array<Array<any>>} rows - Matrice des lignes de données
 */
export const exportCSV = (filename, headers, rows) => {
  const escapeCell = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerLine = headers.map(escapeCell).join(';');
  const rowLines = rows.map(row => row.map(escapeCell).join(';'));
  
  // Utiliser UTF-8 BOM (\uFEFF) pour assurer la bonne ouverture sur Microsoft Excel / Google Sheets
  const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Génère et déclenche l'impression/sauvegarde en PDF d'un rapport de Télémétrie ou de Revenus
 */
export const exportPDFReport = ({
  title = 'Rapport d\'Activité & Télémétrie',
  subtitle = 'PlaygroundSpot — Dakar, Sénégal',
  metadata = [],
  headers = [],
  rows = [],
  summaryFooter = ''
}) => {
  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) {
    alert('Veuillez autoriser les fenêtres surgissantes (popups) pour télécharger le rapport PDF.');
    return;
  }

  const currentDate = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const metadataHtml = metadata.map(m => `
    <div style="background: #F4F6F4; padding: 10px 14px; border-radius: 12px; border: 1px solid #E5E7EB;">
      <div style="font-size: 11px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px;">${m.label}</div>
      <div style="font-size: 16px; font-weight: 900; color: #0F2318; margin-top: 2px;">${m.value}</div>
    </div>
  `).join('');

  const tableHeaderHtml = headers.map(h => `
    <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #1A7A4A; text-transform: uppercase; text-align: left; border-bottom: 2px solid #1A7A4A; background: #F4F6F4;">
      ${h}
    </th>
  `).join('');

  const tableRowsHtml = rows.map((row, idx) => `
    <tr style="border-bottom: 1px solid #E5E7EB; background: ${idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'};">
      ${row.map(cell => `<td style="padding: 10px 12px; font-size: 12px; font-weight: 600; color: #1F2937;">${cell ?? '-'}</td>`).join('')}
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8" />
      <title>${title}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
        body {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          margin: 0;
          padding: 30px;
          color: #0F2318;
          background: #FFFFFF;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 3px solid #1A7A4A;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .logo-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .brand-badge {
          background: #1A7A4A;
          color: #FFFFFF;
          font-weight: 900;
          font-size: 16px;
          padding: 8px 14px;
          border-radius: 12px;
          letter-spacing: -0.5px;
        }
        .report-title {
          font-size: 22px;
          font-weight: 900;
          color: #0F2318;
          margin: 0;
        }
        .report-sub {
          font-size: 12px;
          color: #6B7280;
          font-weight: 600;
          margin-top: 4px;
        }
        .metadata-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
          margin-bottom: 24px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
        }
        .footer {
          margin-top: 40px;
          padding-top: 16px;
          border-top: 1px solid #E5E7EB;
          font-size: 11px;
          color: #9CA3AF;
          display: flex;
          justify-content: space-between;
          font-weight: 600;
        }
        @media print {
          body { padding: 15px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="logo-title">
            <span class="brand-badge">⚽ PlaygroundSpot</span>
            <div>
              <h1 class="report-title">${title}</h1>
              <p class="report-sub">${subtitle}</p>
            </div>
          </div>
        </div>
        <div style="text-align: right; font-size: 11px; font-weight: 700; color: #6B7280;">
          Généré le : ${currentDate}<br/>
          Dakar, Sénégal
        </div>
      </div>

      ${metadata.length > 0 ? `<div class="metadata-grid">${metadataHtml}</div>` : ''}

      <table>
        <thead>
          <tr>${tableHeaderHtml}</tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      ${summaryFooter ? `<div style="padding: 12px 16px; bg: #F4F6F4; border-radius: 12px; font-weight: 800; font-size: 13px; color: #1A7A4A; text-align: right;">${summaryFooter}</div>` : ''}

      <div class="footer">
        <span>PlaygroundSpot — Plateforme Officielle de Réservation de Terrains à Dakar</span>
        <span>Document d'Impression Certifié</span>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 300);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
};

/**
 * Génère et imprime un reçu / ticket officiel de réservation au format PDF
 */
export const exportReservationReceiptPDF = (reservation) => {
  if (!reservation) return;

  const printWindow = window.open('', '_blank', 'width=700,height=900');
  if (!printWindow) {
    alert('Veuillez autoriser les fenêtres surgissantes pour ouvrir le reçu de réservation.');
    return;
  }

  const resId = reservation.id || 'N/A';
  const terrainNom = reservation.terrain_nom || reservation.terrain || 'Terrain Dakar';
  const joueurNom = reservation.joueur_nom || reservation.joueur || 'Joueur';
  const dateSlot = reservation.date_slot || reservation.date || new Date().toLocaleDateString('fr-FR');
  const heureSlot = reservation.heure_slot || reservation.heure || '19:00 - 20:00';
  const montant = (reservation.montant || 35000).toLocaleString('fr-FR') + ' FCFA';
  const modePaiement = reservation.mode_paiement || reservation.mode || 'Wave / Orange Money';
  const statut = (reservation.statut || reservation.status || 'Confirmée').toUpperCase();

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8"/>
      <title>Reçu de Réservation #${resId.substring(0, 8)}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
        body {
          font-family: 'Inter', sans-serif;
          margin: 0;
          padding: 30px;
          background: #F4F6F4;
          color: #0F2318;
        }
        .ticket-card {
          background: #FFFFFF;
          max-width: 500px;
          margin: 0 auto;
          border-radius: 24px;
          padding: 30px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.08);
          border: 1px solid #E5E7EB;
        }
        .header {
          text-align: center;
          border-bottom: 2px dashed #E5E7EB;
          padding-bottom: 20px;
          margin-bottom: 20px;
        }
        .badge {
          background: #1A7A4A;
          color: white;
          font-size: 11px;
          font-weight: 900;
          padding: 4px 12px;
          border-radius: 20px;
          text-transform: uppercase;
        }
        .res-id {
          font-size: 20px;
          font-weight: 900;
          color: #0F2318;
          margin: 10px 0 2px 0;
        }
        .item-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #F3F4F6;
          font-size: 13px;
        }
        .item-label { color: #6B7280; font-weight: 600; }
        .item-val { color: #0F2318; font-weight: 800; }
        .total-box {
          background: #F4F6F4;
          padding: 16px;
          border-radius: 16px;
          margin-top: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .qr-placeholder {
          text-align: center;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 2px dashed #E5E7EB;
        }
        @media print {
          body { background: #FFFFFF; padding: 0; }
          .ticket-card { box-shadow: none; border: 1px solid #000; }
        }
      </style>
    </head>
    <body>
      <div class="ticket-card">
        <div class="header">
          <span class="badge">⚽ PlaygroundSpot Dakar</span>
          <h2 class="res-id">TICKET #${resId.substring(0, 8).toUpperCase()}</h2>
          <p style="font-size: 12px; color: #1A7A4A; font-weight: 800; margin: 0;">✓ STATUT : ${statut}</p>
        </div>

        <div class="item-row">
          <span class="item-label">Terrain :</span>
          <span class="item-val">${terrainNom}</span>
        </div>
        <div class="item-row">
          <span class="item-label">Nom du Joueur :</span>
          <span class="item-val">${joueurNom}</span>
        </div>
        <div class="item-row">
          <span class="item-label">Date :</span>
          <span class="item-val">${dateSlot}</span>
        </div>
        <div class="item-row">
          <span class="item-label">Créneau Horaire :</span>
          <span class="item-val">${heureSlot}</span>
        </div>
        <div class="item-row">
          <span class="item-label">Mode de Paiement :</span>
          <span class="item-val">${modePaiement}</span>
        </div>

        <div class="total-box">
          <span style="font-size: 12px; font-weight: 700; color: #6B7280;">Montant Réglé</span>
          <span style="font-size: 20px; font-weight: 900; color: #1A7A4A;">${montant}</span>
        </div>

        <div class="qr-placeholder">
          <p style="font-size: 11px; color: #6B7280; font-weight: 600; margin: 0 0 6px 0;">Présentez ce ticket à l'entrée du terrain</p>
          <div style="font-family: monospace; font-size: 12px; font-weight: 700; letter-spacing: 2px; color: #0F2318;">
            *${resId}*
          </div>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 300);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
};
