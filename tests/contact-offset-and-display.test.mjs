import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {placeOffsetMenu} from "../src/lib/ui/offset-menu-position.ts";
import {normalizeDisplayPreferences,DEFAULT_DISPLAY_PREFERENCES} from "../src/lib/ui/display-preferences.ts";

const file=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("quadrant offset menu never collides with any viewport edge",()=>{
  for(const width of [320,375,768,1440])for(const height of [320,667,900])
    for(const x of [0,15,width/2,width-15,width])
      for(const y of [0,15,height/2,height-15,height]){
        const actual=placeOffsetMenu({anchor:{x,y},width:208,height:190,viewportWidth:width,viewportHeight:height,margin:8,gap:8});
        assert.ok(actual.left>=8 && actual.top>=8,JSON.stringify({width,height,x,y,actual}));
        assert.ok(actual.left+208<=width-8,JSON.stringify({width,height,x,y,actual}));
        assert.ok(actual.top+190<=height-8,JSON.stringify({width,height,x,y,actual}));
      }
});
test("menu switches to left/above near bottom right instead of overflowing",()=>{
  const a=placeOffsetMenu({anchor:{x:350,y:620},width:208,height:190,viewportWidth:375,viewportHeight:667});
  assert.ok(a.left<150);
  assert.ok(a.top<430);
  const b=placeOffsetMenu({anchor:{x:18,y:20},width:208,height:190,viewportWidth:375,viewportHeight:667});
  assert.ok(b.left>18 && b.top>20);
});
test("display preferences apply bounded defaults and cannot zero the UI",()=>{
  assert.deepEqual(normalizeDisplayPreferences(null),DEFAULT_DISPLAY_PREFERENCES);
  const a=normalizeDisplayPreferences({uiScale:0,messageFontSize:999,contactListWidth:-20,longPressMs:99999});
  assert.deepEqual(a,{uiScale:0.85,messageFontSize:20,contactListWidth:180,longPressMs:800});
});
test("contact actions are actually exposed by bubble, right click, and touch",()=>{
  const source=file("src/components/network/secure-contact.tsx");
  assert.match(source,/aria-label="Message actions"/);
  assert.match(source,/onContextMenu=\{event=>/);
  assert.match(source,/onPointerDown=\{event=>/);
  assert.match(source,/OffsetContactMenu/);
  assert.match(source,/Quote & reply/);
  assert.match(source,/Copy text/);
  assert.match(source,/Share text/);
  assert.doesNotMatch(source,/<details className="relative shrink-0">/);
  assert.doesNotMatch(source,/window\.confirm\("Allow this guest conversation/);
});
test("settings exposes working size controls and global loader applies them",()=>{
  const prefs=file("src/lib/ui/display-preferences.ts");
  const settings=file("src/components/settings/api-lockbox-screen.tsx");
  const layout=file("src/app/layout.tsx");
  assert.match(prefs,/localStorage\.setItem/);
  assert.match(settings,/Interface scale/);
  assert.match(settings,/Contact list width \(desktop\)/);
  assert.match(settings,/Message text size/);
  assert.match(settings,/long-press/);
  assert.match(layout,/<DisplayPreferencesLoader\s*\/>/);
});
