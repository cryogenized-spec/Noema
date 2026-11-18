export interface DisplayPreferences {
  /** Scales rem-based interface typography and spacing without zooming the viewport. */
  uiScale: number;
  /** Applies to both AI and Contact message bodies. */
  messageFontSize: number;
  /** Desktop contact list width. */
  contactListWidth: number;
  /** Touch/pen long-press delay for the contact message menu. */
  longPressMs: number;
}

export const DISPLAY_SETTINGS_KEY = "noema:display-preferences-v1";
export const DISPLAY_UPDATED_EVENT = "noema:display-preferences-updated";
export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  uiScale:1, messageFontSize:13, contactListWidth:225, longPressMs:460,
};

const bounded=(value:unknown,min:number,max:number,fallback:number)=>{
  const number=typeof value==="number"?value:NaN;
  return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;
};
export function normalizeDisplayPreferences(value:unknown):DisplayPreferences {
  const obj=value && typeof value==="object"?value as Partial<DisplayPreferences>:{};
  return {
    uiScale:bounded(obj.uiScale,0.85,1.25,1),
    messageFontSize:bounded(obj.messageFontSize,11,20,13),
    contactListWidth:bounded(obj.contactListWidth,180,320,225),
    longPressMs:bounded(obj.longPressMs,300,800,460),
  };
}
export function readDisplayPreferences():DisplayPreferences {
  try {
    const data=localStorage.getItem(DISPLAY_SETTINGS_KEY);
    return data?normalizeDisplayPreferences(JSON.parse(data)):DEFAULT_DISPLAY_PREFERENCES;
  } catch {return DEFAULT_DISPLAY_PREFERENCES;}
}
export function applyDisplayPreferences(input:DisplayPreferences):void {
  if(typeof document==="undefined")return;
  const p=normalizeDisplayPreferences(input);
  document.documentElement.style.fontSize=(16*p.uiScale)+"px";
  document.documentElement.style.setProperty("--noema-message-font-size",p.messageFontSize+"px");
  document.documentElement.style.setProperty("--noema-contact-sidebar-width",p.contactListWidth+"px");
}
export function saveDisplayPreferences(input:DisplayPreferences):DisplayPreferences {
  const normalized=normalizeDisplayPreferences(input);
  try{localStorage.setItem(DISPLAY_SETTINGS_KEY,JSON.stringify(normalized));}catch{ /* best effort */ }
  applyDisplayPreferences(normalized);
  if(typeof window!=="undefined")window.dispatchEvent(new Event(DISPLAY_UPDATED_EVENT));
  return normalized;
}
