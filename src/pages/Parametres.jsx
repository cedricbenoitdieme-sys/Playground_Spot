import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  IconUser, IconLock, IconBell, IconSettings, IconInfoCircle,
  IconChevronRight, IconCheck, IconX, IconEye, IconEyeOff,
  IconMail, IconPhone, IconBuildingStore, IconLogout,
  IconEdit, IconShield, IconPalette, IconDeviceMobile,
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
/* ── Toggle switch ── */
const Toggle = ({ value, onChange }) => (
  <button onClick={() => onChange(!value)}
    className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none ${value ? 'bg-primary' : 'bg-gray-200'}`}>
    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300 ${value ? 'left-7' : 'left-1'}`} />
  </button>
);

/* ── Section card ── */
const Section = ({ title, icon: Icon, children, delay = 0 }) => (
  <div className="bg-white rounded-2xl border border-black/5 shadow-subtle overflow-hidden"
    style={{ animation: `slideUp 0.45s ${delay}s cubic-bezier(.22,1,.36,1) both` }}>
    <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon size={16} className="text-primary" />
      </div>
      <h2 className="font-bold text-primary-dark text-[15px]">{title}</h2>
    </div>
    <div className="divide-y divide-gray-50">{children}</div>
  </div>
);

/* ── Row item ── */
const Row = ({ label, sub, children, onClick }) => (
  <div onClick={onClick} className={`flex items-center justify-between px-5 py-4 gap-4 ${onClick ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors' : ''} min-h-[56px]`}>
    <div className="min-w-0">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 font-medium mt-0.5">{sub}</p>}
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

/* ── Bottom Sheet ── */
const Sheet = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 lg:left-64 z-[9999]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-bold text-lg text-primary-dark">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"><IconX size={18} /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  , document.body);
};

/* ════════════════════════ PAGE ════════════════════════ */
export const Parametres = ({ setView }) => {
  const { setCurrentUser } = useUser();
  // Profil
  const [profil, setProfil] = useState({ nom: 'Admin PlaygroundSpot', email: 'admin@playgroundspot.sn', tel: '+221 77 000 00 01' });
  const [editProfil, setEditProfil] = useState(false);
  const [profilForm, setProfilForm] = useState(profil);

  // Mot de passe
  const [editPwd, setEditPwd] = useState(false);
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [showPwd, setShowPwd] = useState({ current: false, next: false, confirm: false });

  // Notifications
  const [notifs, setNotifs] = useState({
    nouvelleReservation: true,
    nouvelGerant: true,
    paiementRecu: true,
    alerteOccupation: false,
    rapportHebdo: true,
    smsAlerte: false,
  });

  // Plateforme
  const [plateforme, setPlateforme] = useState({
    commission: '10',
    devise: 'FCFA',
    fuseauHoraire: 'Africa/Dakar',
    modeMainten: false,
  });
  const [editPlat, setEditPlat] = useState(false);
  const [platForm, setPlatForm] = useState(plateforme);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleSaveProfil = (e) => {
    e.preventDefault();
    setProfil(profilForm);
    setEditProfil(false);
    showToast('Profil mis à jour ✓');
  };

  const handleSavePwd = (e) => {
    e.preventDefault();
    if (pwd.next !== pwd.confirm) { showToast('❌ Les mots de passe ne correspondent pas'); return; }
    if (pwd.next.length < 8) { showToast('❌ Minimum 8 caractères'); return; }
    setPwd({ current: '', next: '', confirm: '' });
    setEditPwd(false);
    showToast('Mot de passe mis à jour ✓');
  };

  const handleSavePlat = (e) => {
    e.preventDefault();
    setPlateforme(platForm);
    setEditPlat(false);
    showToast('Paramètres plateforme mis à jour ✓');
  };

  return (
    <div className="flex-1 overflow-y-auto pb-28 lg:pb-12">

      {/* Header */}
      <div className="px-5 lg:px-8 pt-6 pb-5" style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}>
        <h1 className="text-2xl font-display font-bold text-primary-dark tracking-tight">Paramètres</h1>
        <p className="text-xs text-gray-400 font-medium mt-0.5">Configuration de la plateforme</p>
      </div>

      <div className="px-5 lg:px-8 space-y-4">

        {/* ── Profil ── */}
        <Section title="Mon profil" icon={IconUser} delay={0.05}>
          {/* Avatar */}
          <div className="px-5 py-5 flex items-center gap-4 border-b border-gray-50">
            <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-primary/20 flex-shrink-0">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-primary-dark text-base">{profil.nom}</p>
              <p className="text-[11px] text-gray-400 font-medium">Super Administrateur</p>
              <p className="text-[11px] text-primary font-semibold mt-0.5">{profil.email}</p>
            </div>
            <button onClick={() => { setProfilForm(profil); setEditProfil(true); }}
              className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center">
              <IconEdit size={16} className="text-gray-600" />
            </button>
          </div>
          <Row label="Email" sub={profil.email} onClick={() => { setProfilForm(profil); setEditProfil(true); }}>
            <IconChevronRight size={16} className="text-gray-300" />
          </Row>
          <Row label="Téléphone" sub={profil.tel} onClick={() => { setProfilForm(profil); setEditProfil(true); }}>
            <IconChevronRight size={16} className="text-gray-300" />
          </Row>
        </Section>

        {/* ── Sécurité ── */}
        <Section title="Sécurité" icon={IconShield} delay={0.1}>
          <Row label="Mot de passe" sub="Changer votre mot de passe" onClick={() => setEditPwd(true)}>
            <IconChevronRight size={16} className="text-gray-300" />
          </Row>
          <Row label="Authentification 2FA" sub="Non configuré">
            <span className="text-[11px] font-bold px-2.5 py-1 bg-yellow-50 text-yellow-700 rounded-full border border-yellow-200">Bientôt</span>
          </Row>
          <Row label="Sessions actives" sub="1 session active">
            <span className="text-[11px] font-bold px-2.5 py-1 bg-green-50 text-green-700 rounded-full border border-green-200">Actif</span>
          </Row>
        </Section>

        {/* ── Notifications ── */}
        <Section title="Notifications" icon={IconBell} delay={0.15}>
          {[
            { key: 'nouvelleReservation', label: 'Nouvelle réservation',     sub: 'Alerte à chaque booking' },
            { key: 'nouvelGerant',        label: 'Nouveau gérant inscrit',   sub: 'Demande d\'approbation' },
            { key: 'paiementRecu',        label: 'Paiement reçu',            sub: 'Confirmation de paiement' },
            { key: 'alerteOccupation',    label: 'Alerte taux d\'occupation',sub: 'Si < 50% sur 24h' },
            { key: 'rapportHebdo',        label: 'Rapport hebdomadaire',     sub: 'Résumé envoyé chaque lundi' },
            { key: 'smsAlerte',           label: 'Alertes SMS',              sub: 'Via votre numéro enregistré' },
          ].map(({ key, label, sub }) => (
            <Row key={key} label={label} sub={sub}>
              <Toggle value={notifs[key]} onChange={v => setNotifs(p => ({ ...p, [key]: v }))} />
            </Row>
          ))}
        </Section>

        {/* ── Plateforme ── */}
        <Section title="Plateforme" icon={IconSettings} delay={0.2}>
          <Row label="Commission plateforme" sub={`${plateforme.commission}% sur chaque réservation`} onClick={() => { setPlatForm(plateforme); setEditPlat(true); }}>
            <IconChevronRight size={16} className="text-gray-300" />
          </Row>
          <Row label="Devise" sub={plateforme.devise}>
            <span className="text-sm font-bold text-primary">{plateforme.devise}</span>
          </Row>
          <Row label="Fuseau horaire" sub={plateforme.fuseauHoraire}>
            <span className="text-[11px] text-gray-400 font-medium">UTC+0</span>
          </Row>
          <Row label="Mode maintenance" sub={plateforme.modeMainten ? 'Site inaccessible aux joueurs' : 'Plateforme en ligne'}>
            <Toggle value={plateforme.modeMainten} onChange={v => {
              setPlateforme(p => ({ ...p, modeMainten: v }));
              showToast(v ? '⚠️ Mode maintenance activé' : '✓ Plateforme en ligne');
            }} />
          </Row>
        </Section>

        {/* ── Application ── */}
        <Section title="Application" icon={IconDeviceMobile} delay={0.25}>
          <Row label="Version" sub="PlaygroundSpot Dashboard">
            <span className="text-[11px] font-bold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">v1.2.0</span>
          </Row>
          <Row label="Environnement">
            <span className="text-[11px] font-bold text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">Production</span>
          </Row>
          <Row label="Dernière mise à jour" sub="18/05/2026">
            <IconCheck size={16} className="text-green-500" />
          </Row>
        </Section>

        {/* ── À propos ── */}
        <Section title="À propos" icon={IconInfoCircle} delay={0.3}>
          <Row label="Conditions d'utilisation" onClick={() => {}}>
            <IconChevronRight size={16} className="text-gray-300" />
          </Row>
          <Row label="Politique de confidentialité" onClick={() => {}}>
            <IconChevronRight size={16} className="text-gray-300" />
          </Row>
          <Row label="Support" sub="support@playgroundspot.sn" onClick={() => {}}>
            <IconChevronRight size={16} className="text-gray-300" />
          </Row>
        </Section>

        {/* Déconnexion */}
        <button className="w-full flex items-center justify-center gap-3 py-4 bg-red-50 text-red-600 font-bold rounded-2xl border border-red-100 hover:bg-red-100 active:scale-[0.98] transition-all min-h-[56px]"
          style={{ animation: 'slideUp 0.45s 0.35s cubic-bezier(.22,1,.36,1) both' }}
          onClick={() => {
            showToast('Déconnexion…');
            setTimeout(() => {
              setCurrentUser(null);
              if (setView) setView('landing');
            }, 600);
          }}>
          <IconLogout size={20} /> Se déconnecter
        </button>

        <div className="text-center pb-4" style={{ animation: 'slideUp 0.45s 0.4s cubic-bezier(.22,1,.36,1) both' }}>
          <p className="text-[11px] text-gray-300 font-medium">PlaygroundSpot · Dakar, Sénégal · 2026</p>
        </div>
      </div>

      {/* Sheet: Modifier profil */}
      <Sheet open={editProfil} onClose={() => setEditProfil(false)} title="Modifier le profil">
        <form onSubmit={handleSaveProfil} className="space-y-4">
          {[
            { label: 'Nom complet', key: 'nom', type: 'text', icon: IconUser },
            { label: 'Email',       key: 'email', type: 'email', icon: IconMail },
            { label: 'Téléphone',   key: 'tel', type: 'tel', icon: IconPhone },
          ].map(({ label, key, type, icon: Icon }) => (
            <div key={key}>
              <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1">{label}</label>
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3 focus-within:ring-2 ring-primary/20 transition-all">
                <Icon size={16} className="text-gray-400 flex-shrink-0" />
                <input type={type} value={profilForm[key]} required
                  onChange={e => setProfilForm(p => ({ ...p, [key]: e.target.value }))}
                  className="flex-1 bg-transparent border-none focus:outline-none text-sm" />
              </div>
            </div>
          ))}
          <button type="submit" className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 min-h-[48px] hover:bg-primary-dark transition-colors">
            Enregistrer
          </button>
        </form>
      </Sheet>

      {/* Sheet: Changer mot de passe */}
      <Sheet open={editPwd} onClose={() => setEditPwd(false)} title="Changer le mot de passe">
        <form onSubmit={handleSavePwd} className="space-y-4">
          {[
            { label: 'Mot de passe actuel', key: 'current' },
            { label: 'Nouveau mot de passe', key: 'next' },
            { label: 'Confirmer le nouveau', key: 'confirm' },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1">{label}</label>
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3 focus-within:ring-2 ring-primary/20 transition-all">
                <IconLock size={16} className="text-gray-400 flex-shrink-0" />
                <input type={showPwd[key] ? 'text' : 'password'} value={pwd[key]} required minLength={key !== 'current' ? 8 : 1}
                  onChange={e => setPwd(p => ({ ...p, [key]: e.target.value }))}
                  className="flex-1 bg-transparent border-none focus:outline-none text-sm" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPwd(p => ({ ...p, [key]: !p[key] }))}>
                  {showPwd[key] ? <IconEyeOff size={16} className="text-gray-400" /> : <IconEye size={16} className="text-gray-400" />}
                </button>
              </div>
            </div>
          ))}
          <button type="submit" className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 min-h-[48px] hover:bg-primary-dark transition-colors">
            Mettre à jour
          </button>
        </form>
      </Sheet>

      {/* Sheet: Paramètres plateforme */}
      <Sheet open={editPlat} onClose={() => setEditPlat(false)} title="Paramètres plateforme">
        <form onSubmit={handleSavePlat} className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1">Commission (%)</label>
            <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3 focus-within:ring-2 ring-primary/20">
              <IconBuildingStore size={16} className="text-gray-400" />
              <input type="number" min="0" max="50" value={platForm.commission}
                onChange={e => setPlatForm(p => ({ ...p, commission: e.target.value }))}
                className="flex-1 bg-transparent border-none focus:outline-none text-sm" />
              <span className="text-sm font-bold text-gray-400">%</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1">Devise</label>
            <select value={platForm.devise} onChange={e => setPlatForm(p => ({ ...p, devise: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/20 bg-white">
              <option>FCFA</option>
              <option>EUR</option>
              <option>USD</option>
            </select>
          </div>
          <button type="submit" className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 min-h-[48px] hover:bg-primary-dark transition-colors">
            Enregistrer
          </button>
        </form>
      </Sheet>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-full shadow-2xl text-sm font-medium z-[150] animate-in slide-in-from-bottom-5 duration-300 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
};
