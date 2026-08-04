import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CustomSelect } from '../components/CustomSelect';
import {
  IconUser, IconLock, IconBell, IconSettings, IconInfoCircle,
  IconChevronRight, IconCheck, IconX, IconEye, IconEyeOff,
  IconMail, IconPhone, IconBuildingStore, IconLogout,
  IconEdit, IconShield, IconPalette, IconDeviceMobile, IconCamera,
  IconCash,
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import { updateProfile } from '../services/auth';
import { uploadAvatarPhoto } from '../services/profiles';
import { Avatar } from '../components/Avatar';
import { ImageCropperModal } from '../components/ImageCropperModal';

const ROLE_LABELS = { admin: 'Super Administrateur', gerant: 'Gérant Terrain', joueur: 'Joueur' };
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
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      {sub && <p className="text-[11px] text-gray-500 font-medium mt-0.5">{sub}</p>}
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

/* ── Bottom Sheet ── */
const Sheet = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-md transition-opacity" onClick={onClose} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 z-10">
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
  const { currentUser, setCurrentUser } = useUser();
  // Profil — initialisé depuis le compte réellement connecté, jamais de
  // valeur factice (chaque utilisateur, quel que soit son rôle, voit ses
  // propres informations dès le chargement, sans avoir à les éditer manuellement).
  const [profil, setProfil] = useState({ nom: '', email: '', tel: '' });
  const [editProfil, setEditProfil] = useState(false);
  const [profilForm, setProfilForm] = useState(profil);
  const [savingProfil, setSavingProfil] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setProfil({ nom: currentUser.nom || '', email: currentUser.email || '', tel: currentUser.tel || '' });
    }
  }, [currentUser]);

  // Avatar upload states
  const [avatarFile, setAvatarFile] = useState(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const fileInputRef = React.useRef(null);

  const handleAvatarFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setCropperOpen(true);
    }
  };

  const handleCropComplete = async (croppedBlob) => {
    if (!currentUser?.id) return;
    setCropperOpen(false);
    showToast('Téléversement de la photo…');
    try {
      const publicUrl = await uploadAvatarPhoto(croppedBlob, currentUser.id, currentUser.avatar);
      await updateProfile(currentUser.id, { avatar: publicUrl });
      setCurrentUser(prev => ({ ...prev, avatar: publicUrl }));
      setProfil(prev => ({ ...prev, avatar: publicUrl }));
      showToast('Photo de profil mise à jour ✓');
    } catch (err) {
      console.error('Erreur upload avatar:', err);
      showToast(`❌ ${err.userMessage || err.message || "Échec de l'enregistrement de la photo"}`);
    } finally {
      setAvatarFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Mot de passe
  const [editPwd, setEditPwd] = useState(false);
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [showPwd, setShowPwd] = useState({ current: false, next: false, confirm: false });

  // Notifications
  const DEFAULT_NOTIFS = {
    nouvelleReservation: true,
    paiementRecu: true,
    alerteOccupation: false,
    rapportHebdo: true,
  };

  const [notifs, setNotifs] = useState(DEFAULT_NOTIFS);

  useEffect(() => {
    if (currentUser?.notification_prefs) {
      setNotifs({
        ...DEFAULT_NOTIFS,
        ...currentUser.notification_prefs
      });
    }
  }, [currentUser?.notification_prefs]);

  const handleToggleNotif = async (key, value) => {
    setNotifs(prev => ({ ...prev, [key]: value }));
    try {
      const updatedPrefs = {
        ...DEFAULT_NOTIFS,
        ...(currentUser?.notification_prefs || {}),
        [key]: value
      };
      await updateProfile(currentUser.id, { notification_prefs: updatedPrefs });
      setCurrentUser(prev => ({
        ...prev,
        notification_prefs: updatedPrefs
      }));
    } catch (err) {
      console.error("Erreur de sauvegarde des préférences de notification:", err);
      showToast(`❌ ${err.userMessage || err.message || 'Erreur de mise à jour'}`);
      setNotifs(prev => ({ ...prev, [key]: !value }));
    }
  };

  // Plateforme
  const [plateforme, setPlateforme] = useState({
    devise: 'FCFA',
    fuseauHoraire: 'Africa/Dakar',
    modeMainten: false,
    statsRibbonVisible: true,
  });

  const [statsLive, setStatsLive] = useState(null);
  const [refreshingStats, setRefreshingStats] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // À propos
  const [showCGU, setShowCGU] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showSupport, setShowSupport] = useState(false);

  // Chargement mode maintenance & stats ribbon au montage
  useEffect(() => {
    const fetchPlatformSettings = async () => {
      // 1. Mode maintenance
      const { data: maintData } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'mode_maintenance')
        .maybeSingle();

      if (maintData?.value !== undefined) {
        setPlateforme(prev => ({ ...prev, modeMainten: !!maintData.value }));
      }

      // 2. Visibilité du ruban de stats
      const { data: ribbonData } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'landing_stats_ribbon_visible')
        .maybeSingle();

      if (ribbonData?.value !== undefined) {
        setPlateforme(prev => ({ ...prev, statsRibbonVisible: !!ribbonData.value }));
      }

      // 3. Charger les stats affichées et live
      const { data: statsCache } = await supabase
        .from('stats_plateforme_cache')
        .select('*')
        .eq('id', true)
        .maybeSingle();

      if (statsCache) {
        setStatsLive(statsCache);
      }
    };

    if (['admin', 'super_admin'].includes(currentUser?.role)) {
      fetchPlatformSettings();
    }
  }, [currentUser]);

  // Handler bascule Mode maintenance
  const handleToggleMaintenance = async (v) => {
    showToast(v ? '⚠️ Mode maintenance activé' : '✓ Plateforme en ligne');
    setPlateforme(prev => ({ ...prev, modeMainten: v }));
    const { error } = await supabase
      .from('system_settings')
      .update({ value: v, updated_at: new Date().toISOString() })
      .eq('key', 'mode_maintenance');
    if (error) {
      showToast(`❌ ${error.message}`);
      setPlateforme(prev => ({ ...prev, modeMainten: !v }));
    }
  };

  // Handler bascule Ruban de stats
  const handleToggleStatsRibbon = async (v) => {
    showToast(v ? '✓ Ruban de stats activé' : 'ℹ️ Ruban de stats masqué');
    setPlateforme(prev => ({ ...prev, statsRibbonVisible: v }));
    const { error } = await supabase
      .from('system_settings')
      .update({ value: v, updated_at: new Date().toISOString() })
      .eq('key', 'landing_stats_ribbon_visible');
    if (error) {
      showToast(`❌ ${error.message}`);
      setPlateforme(prev => ({ ...prev, statsRibbonVisible: !v }));
    }
  };

  // Recalcul immédiat des stats plateforme super admin
  const handleRefreshPlatformStats = async () => {
    setRefreshingStats(true);
    try {
      const { data, error } = await supabase.rpc('admin_refresh_stats_plateforme');
      if (error) throw error;
      if (data) {
        setStatsLive(data);
        showToast('✓ Statistiques recalculées avec succès');
      }
    } catch (err) {
      console.error('Erreur recalcul stats:', err);
      showToast(`❌ ${err.message || 'Échec du recalcul'}`);
    } finally {
      setRefreshingStats(false);
    }
  };

  // Compte de versement gérant
  const [payoutInfo, setPayoutInfo] = useState({ phone: '', operator: 'wave' });
  const [savingPayoutInfo, setSavingPayoutInfo] = useState(false);

  useEffect(() => {
    const fetchPayoutInfo = async () => {
      if (currentUser?.role !== 'gerant') return;
      const { data } = await supabase
        .from('gerant_payout_info')
        .select('phone, operator')
        .eq('gerant_id', currentUser.id)
        .maybeSingle();
      if (data) setPayoutInfo({ phone: data.phone || '', operator: data.operator || 'wave' });
    };
    fetchPayoutInfo();
  }, [currentUser?.id, currentUser?.role]);

  const handleSavePayoutInfo = async () => {
    setSavingPayoutInfo(true);
    const { error } = await supabase.rpc('upsert_gerant_payout_info', {
      p_phone: payoutInfo.phone.replace(/\s+/g, ''),
      p_operator: payoutInfo.operator,
    });
    setSavingPayoutInfo(false);
    if (error) {
      showToast(`❌ ${error.message}`);
    } else {
      showToast('✓ Compte de versement mis à jour');
    }
  };

  // Commissions réelles par plan
  const [planRates, setPlanRates] = useState([]);
  useEffect(() => {
    supabase
      .from('plan_limits')
      .select('plan_id, nom, commission_rate')
      .order('prix_mensuel')
      .then(({ data }) => setPlanRates(data || []));
  }, []);

  // Dérogation temporaire globale de commission
  const [override, setOverride] = useState(null);
  const [overrideForm, setOverrideForm] = useState({ rate: '0', hours: '24' });
  const [showOverrideModal, setShowOverrideModal] = useState(false);

  const fetchOverride = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'commission_override')
      .maybeSingle();
    const v = data?.value;
    if (v && v.expires_at && new Date(v.expires_at) > new Date()) {
      setOverride(v);
    } else {
      setOverride(null);
    }
  };

  useEffect(() => {
    if (['admin', 'super_admin'].includes(currentUser?.role)) {
      fetchOverride();
    }
  }, [currentUser]);

  const handleActivateOverride = async (e) => {
    e.preventDefault();
    const rateNum = parseFloat(overrideForm.rate);
    const hoursNum = parseFloat(overrideForm.hours);
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
      showToast('❌ Taux invalide (0 à 100%)');
      return;
    }
    if (isNaN(hoursNum) || hoursNum <= 0) {
      showToast('❌ Durée invalide (en heures)');
      return;
    }

    const { data, error } = await supabase.rpc('set_commission_override', {
      p_rate: rateNum,
      p_duree_heures: hoursNum,
    });

    if (error) {
      showToast(`❌ ${error.message}`);
    } else {
      setOverride(data);
      setShowOverrideModal(false);
      showToast('Dérogation commission activée ✓');
    }
  };

  const handleClearOverride = async () => {
    const { error } = await supabase.rpc('clear_commission_override');
    if (error) {
      showToast(`❌ ${error.message}`);
    } else {
      setOverride(null);
      showToast('Dérogation commission désactivée ✓');
    }
  };

  const handleSaveProfil = async (e) => {
    e.preventDefault();
    if (!currentUser?.id) return;
    setSavingProfil(true);
    try {
      const updated = await updateProfile(currentUser.id, {
        nom: profilForm.nom.trim(),
        tel: profilForm.tel.trim(),
        // email volontairement exclu : un changement d'email doit passer
        // par le flow de confirmation Supabase Auth (supabase.auth.updateUser),
        // pas par une simple UPDATE de la table profiles.
      });
      setProfil(prev => ({ ...prev, nom: updated.nom, tel: updated.tel }));
      setCurrentUser({ ...currentUser, nom: updated.nom, tel: updated.tel });
      setEditProfil(false);
      showToast('Profil mis à jour ✓');
    } catch (err) {
      showToast(`❌ ${err.userMessage || err.message || 'Erreur lors de la mise à jour du profil'}`);
    } finally {
      setSavingProfil(false);
    }
  };

  const handleSavePwd = async (e) => {
    e.preventDefault();

    if (!pwd.current) {
      showToast('❌ Veuillez saisir votre mot de passe actuel');
      return;
    }
    
    const hasUpperCase = /[A-Z]/.test(pwd.next);
    const hasLowerCase = /[a-z]/.test(pwd.next);
    const hasNumber = /[0-9]/.test(pwd.next);
    const hasSpecialChar = /[^A-Za-z0-9]/.test(pwd.next);
    
    if (pwd.next !== pwd.confirm) { 
      showToast('❌ Les mots de passe ne correspondent pas'); 
      return; 
    }
    if (pwd.next.length < 8) { 
      showToast('❌ Le mot de passe doit faire au moins 8 caractères'); 
      return; 
    }
    if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
      showToast('❌ Le mot de passe doit contenir une majuscule, une minuscule, un chiffre et un caractère spécial');
      return;
    }
    
    try {
      // Re-vérification de l'identité avant tout changement sensible.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: currentUser?.email,
        password: pwd.current,
      });
      if (reauthError) {
        showToast('❌ Mot de passe actuel incorrect');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: pwd.next });
      if (error) {
        showToast(`❌ Erreur: ${error.message}`);
        return;
      }
      setPwd({ current: '', next: '', confirm: '' });
      setEditPwd(false);
      showToast('Mot de passe mis à jour avec succès ✓');
    } catch (err) {
      showToast(`❌ Erreur réseau lors de la mise à jour`);
    }
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
            <div className="relative group">
              <Avatar user={currentUser} className="w-16 h-16 rounded-2xl shadow-lg shadow-primary/20" textSize="text-2xl" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 p-1.5 bg-primary text-white rounded-xl shadow hover:bg-primary-dark transition-all cursor-pointer"
                title="Changer la photo de profil"
              >
                <IconCamera size={14} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="hidden"
                onChange={handleAvatarFileSelect}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-primary-dark text-base">{profil.nom}</p>
              <p className="text-[11px] text-gray-400 font-medium">{ROLE_LABELS[currentUser?.role] || currentUser?.role}</p>
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
            { key: 'nouvelleReservation', label: 'Nouvelle réservation', sub: 'Alerte à chaque réservation' },
            { key: 'paiementRecu', label: 'Paiement reçu', sub: 'Confirmation de règlement' },
            { key: 'alerteOccupation', label: 'Alerte taux d\'occupation', sub: 'Si < 50% sur la journée' },
            { key: 'rapportHebdo', label: 'Rapport hebdomadaire', sub: 'Résumé généré chaque lundi' },
          ].map(({ key, label, sub }) => (
            <Row key={key} label={label} sub={sub}>
              <Toggle value={notifs[key] ?? true} onChange={v => handleToggleNotif(key, v)} />
            </Row>
          ))}
        </Section>

        {/* ── Compte de versement gérant ── */}
        {currentUser?.role === 'gerant' && (
          <Section title="Compte de versement" icon={IconCash} delay={0.18}>
            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-500">
                Vos revenus de réservations (montant moins la commission de votre
                plan) sont versés automatiquement sur ce compte après chaque
                paiement confirmé.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Opérateur</label>
                  <select
                    value={payoutInfo.operator}
                    onChange={(e) => setPayoutInfo(prev => ({ ...prev, operator: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm"
                  >
                    <option value="wave">Wave Mobile Money</option>
                    <option value="orange_money">Orange Money Sénégal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Numéro de téléphone</label>
                  <input
                    type="tel"
                    value={payoutInfo.phone}
                    onChange={(e) => setPayoutInfo(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="77 123 45 67"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
              </div>
              <button
                onClick={handleSavePayoutInfo}
                disabled={savingPayoutInfo}
                className="px-5 py-2.5 bg-primary text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50"
              >
                {savingPayoutInfo ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </Section>
        )}

        {/* ── Plateforme ── */}
        {['admin', 'super_admin'].includes(currentUser?.role) && (
          <Section title="Plateforme" icon={IconSettings} delay={0.2}>
            <Row label="Mode maintenance" sub={plateforme.modeMainten ? 'Site inaccessible aux joueurs' : 'Plateforme en ligne'}>
              <Toggle value={plateforme.modeMainten} onChange={handleToggleMaintenance} />
            </Row>

            <Row label="Ruban de stats (landing page)" sub={plateforme.statsRibbonVisible ? 'Visible sur la page d\'accueil publique' : 'Masqué — le simulateur remonte à sa place'}>
              <Toggle value={plateforme.statsRibbonVisible} onChange={handleToggleStatsRibbon} />
            </Row>

            {/* Comparatif Stats Publiques (High-Water Mark) vs Données Live Réelles */}
            {statsLive && (
              <div className="px-5 py-4 bg-gray-50/70 border-t border-b border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Statistiques Landing Page</p>
                  <button
                    onClick={handleRefreshPlatformStats}
                    disabled={refreshingStats}
                    className="text-[11px] font-bold text-primary hover:text-primary-dark cursor-pointer disabled:opacity-50 flex items-center gap-1"
                  >
                    {refreshingStats ? 'Calcul en cours...' : '🔄 Recalculer maintenant'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-600">
                  <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Joueurs Dakarois</span>
                    <p className="mt-1">Affiché : <b className="text-primary-dark font-display text-sm">{statsLive.nombre_joueurs}</b></p>
                    <p className="text-[11px] text-gray-500 font-medium">Réel actuel : {statsLive.nombre_joueurs_live}</p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Terrains Homologués</span>
                    <p className="mt-1">Affiché : <b className="text-primary-dark font-display text-sm">{statsLive.nombre_terrains}</b></p>
                    <p className="text-[11px] text-gray-500 font-medium">Réel actuel : {statsLive.nombre_terrains_live}</p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Taux Satisfaction</span>
                    <p className="mt-1">Affiché : <b className="text-[#1A7A4A] font-display text-sm">{statsLive.taux_satisfaction != null ? `${statsLive.taux_satisfaction}%` : 'Nouveau ! ⭐'}</b></p>
                    <p className="text-[11px] text-gray-500 font-medium">Réel actuel : {statsLive.taux_satisfaction_live != null ? `${statsLive.taux_satisfaction_live}%` : 'Nouveau ! ⭐'}</p>
                  </div>
                </div>
              </div>
            )}

            <Row label="Devise" sub={plateforme.devise}>
              <span className="text-sm font-bold text-primary">{plateforme.devise}</span>
            </Row>
            <Row label="Fuseau horaire" sub={plateforme.fuseauHoraire}>
              <span className="text-[11px] text-gray-400 font-medium">UTC+0</span>
            </Row>

            {/* Affichage des taux réels par plan (lecture seule) */}
            <div className="px-5 py-4 border-t border-gray-50 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Commissions par plan (Taux réels)</p>
                <span className="text-[10px] text-gray-400 italic">Fixé par offre</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {planRates.map(p => (
                  <div key={p.plan_id} className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                    <p className="text-xs font-bold text-gray-700 capitalize">{p.nom || p.plan_id}</p>
                    <p className="text-sm font-black text-primary mt-0.5">{p.commission_rate ?? 0}%</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Dérogation temporaire globale */}
            <div className="px-5 py-4 border-t border-gray-50 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Dérogation temporaire globale</p>
                  <p className="text-[11px] text-gray-500 font-medium mt-0.5">Applique un taux temporaire à tous les gérants</p>
                </div>
                {!override && (
                  <button
                    type="button"
                    onClick={() => setShowOverrideModal(true)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-sm transition-colors cursor-pointer shrink-0"
                  >
                    Activer
                  </button>
                )}
              </div>

              {override ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2 text-amber-900">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider bg-amber-200/60 text-amber-900 px-2.5 py-1 rounded-full">
                      Dérogation Active
                    </span>
                    <button
                      type="button"
                      onClick={handleClearOverride}
                      className="text-xs font-bold text-red-600 hover:text-red-700 underline cursor-pointer"
                    >
                      Désactiver maintenant
                    </button>
                  </div>
                  <p className="text-sm font-bold">
                    Taux appliqué : <span className="text-base text-primary font-black">{override.rate}%</span> sur toutes les réservations
                  </p>
                  <p className="text-xs text-amber-800">
                    Expire le : <span className="font-semibold">{new Date(override.expires_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Aucune dérogation temporaire en cours. Les commissions par plan s'appliquent normalement.</p>
              )}
            </div>
          </Section>
        )}

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
          <Row label="Conditions d'utilisation" onClick={() => setShowCGU(true)}>
            <IconChevronRight size={16} className="text-gray-300" />
          </Row>
          <Row label="Politique de confidentialité" onClick={() => setShowPrivacy(true)}>
            <IconChevronRight size={16} className="text-gray-300" />
          </Row>
          <Row label="Support" sub="drixoftm@gmail.com" onClick={() => setShowSupport(true)}>
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
            { label: 'Nom complet', key: 'nom', type: 'text', icon: IconUser, editable: true },
            { label: 'Email',       key: 'email', type: 'email', icon: IconMail, editable: false },
            { label: 'Téléphone',   key: 'tel', type: 'tel', icon: IconPhone, editable: true },
          ].map(({ label, key, type, icon: Icon, editable }) => (
            <div key={key}>
              <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1">
                {label}{!editable && <span className="normal-case font-medium text-gray-400"> (non modifiable ici)</span>}
              </label>
              <div className={`flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3 transition-all ${editable ? 'focus-within:ring-2 ring-primary/20' : 'bg-gray-50 opacity-70'}`}>
                <Icon size={16} className="text-gray-400 flex-shrink-0" />
                <input type={type} value={profilForm[key]} required disabled={!editable}
                  onChange={e => setProfilForm(p => ({ ...p, [key]: e.target.value }))}
                  className="flex-1 bg-transparent border-none focus:outline-none text-sm disabled:cursor-not-allowed" />
              </div>
            </div>
          ))}
          <button type="submit" disabled={savingProfil} className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 min-h-[48px] hover:bg-primary-dark transition-colors disabled:opacity-60">
            {savingProfil ? 'Enregistrement...' : 'Enregistrer'}
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
                <button 
                  type="button" 
                  onClick={() => setShowPwd(p => ({ ...p, [key]: !p[key] }))}
                  className="focus:outline-none transition-transform duration-300 active:scale-90 hover:scale-110 cursor-pointer"
                >
                  <div className={`transition-all duration-300 transform ${showPwd[key] ? 'rotate-180 scale-100 opacity-90' : 'rotate-0 scale-100 opacity-70'}`}>
                    {showPwd[key] ? (
                      <IconEyeOff size={16} className="text-primary" />
                    ) : (
                      <IconEye size={16} className="text-gray-400" />
                    )}
                  </div>
                </button>
              </div>
            </div>
          ))}
          <button type="submit" className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 min-h-[48px] hover:bg-primary-dark transition-colors">
            Mettre à jour
          </button>
        </form>
      </Sheet>

      {/* Sheet: Dérogation temporaire commission */}
      <Sheet open={showOverrideModal} onClose={() => setShowOverrideModal(false)} title="Dérogation de commission globale">
        <form onSubmit={handleActivateOverride} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
            ⚠️ <strong>Attention :</strong> Cette dérogation remplacera temporairement le taux de commission de tous les gérants par le taux choisi ci-dessous, pour toute nouvelle réservation confirmée pendant la durée spécifiée.
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1">Taux dérogatoire (%)</label>
            <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3 focus-within:ring-2 ring-primary/20">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={overrideForm.rate}
                onChange={e => setOverrideForm(f => ({ ...f, rate: e.target.value }))}
                className="flex-1 bg-transparent border-none focus:outline-none text-sm font-bold"
                placeholder="Ex: 0"
                required
              />
              <span className="text-sm font-bold text-gray-400">%</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1">Durée (heures)</label>
            <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3 focus-within:ring-2 ring-primary/20">
              <input
                type="number"
                min="1"
                max="720"
                step="1"
                value={overrideForm.hours}
                onChange={e => setOverrideForm(f => ({ ...f, hours: e.target.value }))}
                className="flex-1 bg-transparent border-none focus:outline-none text-sm font-bold"
                placeholder="Ex: 24"
                required
              />
              <span className="text-xs font-bold text-gray-400">heures</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Exemple : 24 = 1 jour · 48 = 2 jours · 168 = 1 semaine</p>
          </div>

          <button type="submit" className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 min-h-[48px] transition-colors cursor-pointer">
            Activer la dérogation
          </button>
        </form>
      </Sheet>

      {/* Sheet: Conditions d'utilisation */}
      <Sheet open={showCGU} onClose={() => setShowCGU(false)} title="Conditions Générales d'Utilisation">
        <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
          <div>
            <h4 className="font-bold text-primary-dark mb-1">1. Objet</h4>
            <p>Les présentes Conditions Générales d'Utilisation ont pour objet de définir les modalités de mise à disposition des services du site PlaygroundSpot et les conditions d'utilisation par l'Utilisateur.</p>
          </div>
          <div>
            <h4 className="font-bold text-primary-dark mb-1">2. Traitement des paiements</h4>
            <p>Les paiements, notamment les règlements par Wave qui sont rendus possibles grâce à notre partenaire Unitech Pay, sont traités de manière sécurisée. Nous ne stockons aucune information bancaire sur nos serveurs.</p>
          </div>
          <div>
            <h4 className="font-bold text-primary-dark mb-1">3. Services proposés</h4>
            <p>PlaygroundSpot met en relation des joueurs amateurs et des gérants d'infrastructures sportives privées à Dakar. Nous agissons en tant qu'intermédiaire technologique.</p>
          </div>
          <div>
            <h4 className="font-bold text-primary-dark mb-1">4. Paiement et Annulation</h4>
            <p>Tout paiement (dont les paiements Wave possibles grâce à Unitech Pay) est définitif. L'annulation d'une réservation dépend des conditions propres fixées par le gérant.</p>
          </div>
        </div>
      </Sheet>

      {/* Sheet: Politique de confidentialité */}
      <Sheet open={showPrivacy} onClose={() => setShowPrivacy(false)} title="Politique de Confidentialité">
        <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
          <div>
            <h4 className="font-bold text-primary-dark mb-1">1. Collecte des données</h4>
            <p>Nous collectons les données strictement nécessaires à la réservation de votre terrain : nom, prénom, numéro de téléphone et données de transaction.</p>
          </div>
          <div>
            <h4 className="font-bold text-primary-dark mb-1">2. Traitement des paiements</h4>
            <p>Les paiements, notamment les règlements par Wave qui sont rendus possibles grâce à notre partenaire Unitech Pay, sont traités de manière sécurisée. Nous ne stockons aucune information bancaire sur nos serveurs.</p>
          </div>
          <div>
            <h4 className="font-bold text-primary-dark mb-1">3. Partage d'informations</h4>
            <p>Vos informations de contact sont uniquement partagées avec le gérant du terrain que vous avez réservé afin d'assurer le bon déroulement de votre match.</p>
          </div>
        </div>
      </Sheet>

      {/* Sheet: Support */}
      <Sheet open={showSupport} onClose={() => setShowSupport(false)} title="Support Client">
        <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
          <p>Besoin d'aide ou d'une assistance pour vos réservations ? Notre équipe support est à votre entière disposition.</p>
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2">
            <p className="font-semibold text-gray-800">✉ Email : <a href="mailto:drixoftm@gmail.com?subject=Support%20PlaygroundSpot" className="text-primary font-bold">drixoftm@gmail.com</a></p>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Cet email est réservé aux demandes de support et aux propositions de collaboration commerciale — tout autre message ne sera pas traité.
            Merci de toujours indiquer un objet clair : un email sans objet tombe souvent en spam, et l'absence de réponse dans ce cas n'engage pas notre responsabilité.
          </p>
        </div>
      </Sheet>

      {/* Cropper Modal pour Avatar */}
      <ImageCropperModal
        isOpen={cropperOpen}
        imageFile={avatarFile}
        onClose={() => {
          setCropperOpen(false);
          setAvatarFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
        onCropComplete={handleCropComplete}
        aspectRatio={1}
        cropShape="circle"
        title="Recadrer la photo de profil"
        subtitle="Ajustez l'image pour un rendu optimal sur votre profil."
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-full shadow-2xl text-sm font-medium z-[150] animate-in slide-in-from-bottom-5 duration-300 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
};
