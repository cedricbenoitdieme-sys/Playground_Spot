# PROMPT — Vérifier le mot de passe actuel avant de le changer (faille de sécurité)

## Symptôme

Sur la modale "Changer le mot de passe" (Paramètres), le champ "Mot de
passe actuel" est affiché et saisi, mais **n'est jamais vérifié**. N'importe
qui avec une session déjà ouverte peut changer le mot de passe en tapant
n'importe quoi dans ce champ — aucune re-vérification d'identité n'a lieu.

## Cause identifiée

`src/pages/Parametres.jsx`, fonction `handleSavePwd` (lignes 231-264) :

```jsx
const handleSavePwd = async (e) => {
  e.preventDefault();

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
```

`pwd.current` (état déclaré ligne 119, champ de saisie ligne ~455) n'apparaît
nulle part dans cette fonction — capturé pour rien.

## Ta tâche

Avant l'appel à `supabase.auth.updateUser`, ajoute une étape de
re-authentification avec le mot de passe actuel saisi, et bloque tout le
reste si elle échoue :

```jsx
if (!pwd.current) {
  showToast('❌ Veuillez saisir votre mot de passe actuel');
  return;
}

// Re-vérification de l'identité avant tout changement sensible.
const { error: reauthError } = await supabase.auth.signInWithPassword({
  email: currentUser.email,
  password: pwd.current,
});
if (reauthError) {
  showToast('❌ Mot de passe actuel incorrect');
  return;
}

const { error } = await supabase.auth.updateUser({ password: pwd.next });
// ... reste inchangé
```

Place ce bloc juste avant l'appel existant à `supabase.auth.updateUser`,
après les validations de format déjà en place sur `pwd.next`/`pwd.confirm`.

## Points d'attention

- `signInWithPassword` avec un mot de passe correct **rafraîchit la
  session actuelle** (même utilisateur) — pas d'effet de bord de
  déconnexion à gérer, mais teste quand même que `currentUser`/le state
  d'auth ne se réinitialise pas de façon inattendue après cet appel
  (écoute-t-on `onAuthStateChange` ailleurs dans l'app d'une façon qui
  pourrait mal réagir à un événement de connexion supplémentaire ?).
- Ajoute une validation `minLength`/`required` cohérente sur le champ
  "Mot de passe actuel" côté formulaire si ce n'est pas déjà strictement
  fait (actuellement `minLength={key !== 'current' ? 8 : 1}` ligne ~455 —
  1 caractère minimum seulement pour `current`, ce qui est correct puisque
  c'est le mot de passe EXISTANT qu'on vérifie, pas une nouvelle règle de
  complexité à lui imposer).
- Ne rate-limite pas artificiellement ce nouvel appel `signInWithPassword`
  différemment du reste de l'app — le rate limiting Supabase Auth
  standard s'applique déjà nativement à cet endpoint.

## Vérification

- Teste avec un mauvais mot de passe actuel : le changement doit être
  bloqué avec le message clair, `pwd.next` ne doit jamais être appliqué.
- Teste avec le bon mot de passe actuel : le changement doit s'appliquer
  normalement, toast de succès, formulaire réinitialisé/fermé comme avant.
- Confirme qu'aucune régression n'apparaît sur la session de l'utilisateur
  après un changement réussi (pas de déconnexion imprévue, pas de perte de
  `currentUser`).
