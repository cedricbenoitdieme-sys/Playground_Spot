-- ============================================================
-- Migration : permettre à un gérant d'éditer un terrain déjà 'approved'
-- sans repasser par une revalidation admin.
--
-- La policy terrains_update_admin_gerant (migration 20260723120000)
-- verrouillait `status` de façon totalement rigide pour un gérant
-- (nouvelle valeur = ancienne valeur, point final). Ça bloquait aussi,
-- sans qu'on l'ait remarqué jusqu'ici, la resoumission légitime d'un
-- terrain 'rejected' → 'pending' par son propriétaire (RLS l'interdisait
-- déjà avant cette migration, ce n'est pas une régression introduite ici,
-- juste un bug qu'on corrige au passage puisqu'on retouche cette policy).
--
-- Nouvelle règle : un gérant peut soit laisser `status` inchangé (édition
-- normale d'un terrain pending/approved, aucune revalidation déclenchée),
-- soit faire passer SON terrain de 'rejected' à 'pending' (resoumission).
-- Il ne peut JAMAIS mettre lui-même `status = 'approved'` — ça reste
-- exclusivement réservé à l'admin via admin_review_terrain().
-- ============================================================

DROP POLICY IF EXISTS "terrains_update_admin_gerant" ON public.terrains;
CREATE POLICY "terrains_update_admin_gerant" ON public.terrains FOR UPDATE
  USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'gerant' AND gerant_id = auth.uid()))
  WITH CHECK (
    public.get_my_role() = 'admin'
    OR (
      public.get_my_role() = 'gerant' AND gerant_id = auth.uid()
      AND (
        -- Statut inchangé : édition normale, y compris d'un terrain déjà
        -- approuvé — ne redéclenche jamais de validation.
        status = (SELECT t.status FROM public.terrains t WHERE t.id = terrains.id)
        -- Seule transition de statut qu'un gérant peut déclencher
        -- lui-même : resoumission d'un terrain refusé.
        OR (
          (SELECT t.status FROM public.terrains t WHERE t.id = terrains.id) = 'rejected'
          AND status = 'pending'
        )
      )
    )
  );
-- Note : rejection_reason n'a plus besoin d'être verrouillé explicitement
-- ici — la contrainte check_rejection_reason_only_if_rejected (migration
-- 20260723120000) garantit déjà qu'il est NULL dès que status n'est pas
-- 'rejected', quoi que le gérant essaie d'y mettre.
