-- Migration: Fix process_audit_log trigger function to use price instead of tarif_horaire
-- Run this in your Supabase Dashboard SQL Editor to fix the record "old" has no field "tarif_horaire" error.

CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_resource_type TEXT;
  v_resource_id UUID;
  v_old_state JSONB := NULL;
  v_new_state JSONB := NULL;
  v_actor_id UUID;
BEGIN
  -- Détermination de l'acteur (utilisateur actuellement authentifié)
  v_actor_id := auth.uid();

  -- Détermination du type de ressource et ID
  IF TG_TABLE_NAME = 'reservations' THEN
    v_resource_type := 'reservation';
    v_resource_id := COALESCE(NEW.id, OLD.id);
    IF TG_OP = 'UPDATE' AND OLD.statut IS DISTINCT FROM NEW.statut THEN
      v_action := 'update_statut_reservation';
      v_old_state := jsonb_build_object('statut', OLD.statut, 'motif_annulation', OLD.motif_annulation);
      v_new_state := jsonb_build_object('statut', NEW.statut, 'motif_annulation', NEW.motif_annulation);
    END IF;
  ELSIF TG_TABLE_NAME = 'creneaux' THEN
    v_resource_type := 'creneau';
    v_resource_id := COALESCE(NEW.id, OLD.id);
    IF TG_OP = 'UPDATE' AND OLD.statut IS DISTINCT FROM NEW.statut THEN
      v_action := 'update_statut_creneau';
      v_old_state := jsonb_build_object('statut', OLD.statut);
      v_new_state := jsonb_build_object('statut', NEW.statut);
    END IF;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    v_resource_type := 'profile';
    v_resource_id := COALESCE(NEW.id, OLD.id);
    IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
      v_action := 'update_role_utilisateur';
      v_old_state := jsonb_build_object('role', OLD.role);
      v_new_state := jsonb_build_object('role', NEW.role);
    END IF;
  ELSIF TG_TABLE_NAME = 'terrains' THEN
    v_resource_type := 'terrain';
    v_resource_id := COALESCE(NEW.id, OLD.id);
    IF TG_OP = 'INSERT' THEN
      v_action := 'create_terrain';
      v_new_state := jsonb_build_object('nom', NEW.nom, 'adresse', NEW.adresse, 'tarif_horaire', NEW.price);
    ELSIF TG_OP = 'UPDATE' THEN
      v_action := 'update_terrain';
      v_old_state := jsonb_build_object('nom', OLD.nom, 'tarif_horaire', OLD.price);
      v_new_state := jsonb_build_object('nom', NEW.nom, 'tarif_horaire', NEW.price);
    END IF;
  ELSIF TG_TABLE_NAME = 'paiements' THEN
    v_resource_type := 'paiement';
    v_resource_id := COALESCE(NEW.id, OLD.id);
    IF TG_OP = 'UPDATE' AND OLD.statut IS DISTINCT FROM NEW.statut THEN
      v_action := 'update_statut_paiement';
      v_old_state := jsonb_build_object('statut', OLD.statut, 'ref_externe', OLD.ref_externe);
      v_new_state := jsonb_build_object('statut', NEW.statut, 'ref_externe', NEW.ref_externe);
    END IF;
  END IF;

  -- Si une action critique a été identifiée, on enregistre le log
  IF v_action IS NOT NULL THEN
    INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, old_state, new_state)
    VALUES (v_actor_id, v_action, v_resource_type, v_resource_id, v_old_state, v_new_state);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
