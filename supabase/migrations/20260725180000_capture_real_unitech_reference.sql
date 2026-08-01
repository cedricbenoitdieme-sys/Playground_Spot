-- ============================================================
-- Migration : capturer la VRAIE référence renvoyée par UnitechPay.
--
-- Preuve empirique (code source de Sama Boutik, autre SaaS du même
-- compte, déjà en prod) : create_wave_payment/create_orange_maxit
-- N'ACCEPTENT PAS de `reference` en entrée (non envoyée dans leur code) —
-- UnitechPay génère systématiquement SA PROPRE référence, renvoyée dans
-- `data.reference` de la réponse. Sama Boutik relit cette valeur et
-- l'enregistre après coup (UPDATE subscriptions SET unitech_reference =
-- unitechRes.data?.reference).
--
-- PlaygroundSpot faisait l'inverse : envoyait sa propre référence
-- pré-générée (create_pending_subscription/create_pending_boost) et ne
-- relisait jamais celle d'UnitechPay. Résultat : le webhook (qui reçoit
-- LEUR référence) n'aurait jamais trouvé la ligne correspondante via
-- `unitech_reference = payload.reference` — échec systématique "paiement
-- introuvable" sur CHAQUE paiement Wave/Orange Money réel.
--
-- Ces deux RPC permettent à l'edge function create-payment (SECURITY
-- INVOKER, pas service_role) de corriger la référence après avoir reçu la
-- réponse UnitechPay, sans policy RLS UPDATE supplémentaire sur
-- subscriptions/visibility_boosts (qui n'en ont delibérément aucune pour
-- authenticated — voir migration 20260722150000).
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_subscription_reference(
  p_subscription_id UUID,
  p_new_reference TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gerant_id UUID;
BEGIN
  SELECT gerant_id INTO v_gerant_id FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Souscription introuvable';
  END IF;

  IF v_gerant_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  UPDATE public.subscriptions
  SET unitech_reference = p_new_reference, updated_at = NOW()
  WHERE id = p_subscription_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_subscription_reference(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_boost_reference(
  p_boost_id UUID,
  p_new_reference TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gerant_id UUID;
BEGIN
  SELECT gerant_id INTO v_gerant_id FROM public.visibility_boosts WHERE id = p_boost_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Boost introuvable';
  END IF;

  IF v_gerant_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  UPDATE public.visibility_boosts
  SET unitech_reference = p_new_reference, updated_at = NOW()
  WHERE id = p_boost_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_boost_reference(UUID, TEXT) TO authenticated;

-- ============================================================
-- Vérification post-migration :
-- SELECT public.update_subscription_reference('<subscription_id>', 'wave_test_123');
-- SELECT unitech_reference FROM public.subscriptions WHERE id = '<subscription_id>';
-- -- doit refléter 'wave_test_123'
-- ============================================================
