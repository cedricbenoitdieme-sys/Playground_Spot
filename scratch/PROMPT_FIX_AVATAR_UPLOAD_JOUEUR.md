# PROMPT — Rendre l'upload de photo de profil disponible pour les joueurs aussi

## Contexte

L'upload + recadrage de photo de profil (fonctionnalité construite plus
tôt aujourd'hui) n'a été câblé que dans `src/pages/Parametres.jsx` —
partagé entre admin ET gérant (`view === 'parametres'` et
`view === 'gerant-parametres'` pointent tous les deux vers ce composant),
donc ces deux rôles ont déjà la fonctionnalité. Mais **le joueur n'a pas
de page "Paramètres"** — son équivalent est `src/pages/JoueurProfile.jsx`
("Mon Profil"), qui affiche déjà l'avatar via le composant `<Avatar>`
mais n'a jamais reçu le bouton/flux d'upload. Demande explicite de
l'utilisateur : l'upload de photo doit être disponible pour tous les
rôles, donc il faut l'ajouter ici aussi.

## Ta tâche

Reproduis exactement le pattern déjà en place dans `Parametres.jsx`
(imports, state, handlers, JSX) — voir ce fichier comme référence, il n'y
a rien à réinventer :

1. Imports à ajouter dans `JoueurProfile.jsx` :
   ```jsx
   import { IconCamera } from '@tabler/icons-react'; // ajouter à l'import existant ligne 2-14
   import { uploadAvatarPhoto } from '../services/profiles';
   import { ImageCropperModal } from '../components/ImageCropperModal';
   ```
   (`Avatar` est déjà importé ligne 16. `updateOwnProfile` — déjà importé
   ligne 19 et déjà utilisé plus bas dans ce fichier pour sauvegarder le
   profil — fait un `UPDATE` générique sans liste blanche de colonnes,
   donc `updateOwnProfile(currentUser.id, { avatar: publicUrl })`
   fonctionne directement, pas besoin d'importer `updateProfile` en plus.)

2. State + handlers (même logique que `Parametres.jsx`, à adapter au
   `showToast`/`setCurrentUser` déjà présents dans ce fichier, lignes
   28 et 95-98) :
   ```jsx
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
       await updateOwnProfile(currentUser.id, { avatar: publicUrl });
       setCurrentUser(prev => ({ ...prev, avatar: publicUrl }));
       showToast('Photo de profil mise à jour ✓');
     } catch (err) {
       console.error('Erreur upload avatar:', err);
       showToast(err.userMessage || err.message || "Échec de l'enregistrement de la photo");
     } finally {
       setAvatarFile(null);
       if (fileInputRef.current) fileInputRef.current.value = '';
     }
   };
   ```

3. JSX — autour de `<Avatar>` ligne 165, ajoute le bouton caméra +
   l'input file caché, même pattern visuel que `Parametres.jsx` :
   ```jsx
   <div className="relative group">
     <Avatar user={currentUser} className="w-16 h-16 rounded-full border-4 border-primary/20 shadow-lg shadow-primary/10" textSize="text-xl" />
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
   ```
   (Remplace juste la balise `<Avatar ... />` existante ligne 165 par ce
   bloc — le reste du contenu de la carte profil, à droite de l'avatar,
   ne change pas.)

4. Ajoute le rendu du `<ImageCropperModal>` en fin de composant (avant la
   fermeture du fragment/conteneur racine), même config que
   `Parametres.jsx` :
   ```jsx
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
   ```

## Vérification

- En tant que joueur, ouvre "Mon Profil", clique sur l'icône caméra,
  choisis une photo JPEG/PNG, recadre-la (cercle 1:1), valide.
- Confirme que la photo s'affiche immédiatement, et reste après un
  rechargement complet de la page.
- Confirme que la photo apparaît aussi dans les autres endroits où
  l'avatar du joueur est visible (Header, Sidebar, BottomNav — déjà
  génériques via le composant `<Avatar>`, ne devraient rien nécessiter de
  plus).

## Interdictions

- Ne duplique pas `uploadAvatarPhoto`/`ImageCropperModal` — réutilise
  exactement ceux déjà créés pour `Parametres.jsx`, ne recrée rien de
  nouveau.
- Ne touche pas à `Parametres.jsx` — déjà fonctionnel pour admin/gérant,
  hors scope de cette tâche.
