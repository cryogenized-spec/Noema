"use client";
import {useEffect} from "react";
import {
  applyDisplayPreferences, readDisplayPreferences,
  DISPLAY_SETTINGS_KEY, DISPLAY_UPDATED_EVENT,
} from "@/lib/ui/display-preferences";

/** Reapply saved UI sizing on every owner app route without duplicate controls. */
export function DisplayPreferencesLoader() {
  useEffect(()=>{
    const refresh=()=>applyDisplayPreferences(readDisplayPreferences());
    const onStorage=(event:StorageEvent)=>{
      if(!event.key || event.key===DISPLAY_SETTINGS_KEY)refresh();
    };
    refresh();
    window.addEventListener(DISPLAY_UPDATED_EVENT,refresh);
    window.addEventListener("storage",onStorage);
    return()=>{
      window.removeEventListener(DISPLAY_UPDATED_EVENT,refresh);
      window.removeEventListener("storage",onStorage);
    };
  },[]);
  return null;
}
