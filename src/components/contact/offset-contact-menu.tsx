"use client";

import {createPortal} from "react-dom";
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {placeOffsetMenu,type MenuAnchor} from "@/lib/ui/offset-menu-position";

interface OffsetContactMenuProps {
  anchor:MenuAnchor;
  label:string;
  onClose:()=>void;
  children:ReactNode;
}

/** The menu is portalled outside overflow-hidden chat panes, with quadrant
 * positioning and measured size. Click-away and Escape dismiss it. */
export function OffsetContactMenu({anchor,label,onClose,children}:OffsetContactMenuProps) {
  const ref=useRef<HTMLDivElement|null>(null);
  const [position,setPosition]=useState<{left:number;top:number}|null>(null);
  useLayoutEffect(()=>{
    const measure=()=>{
      const element=ref.current;
      if(!element)return;
      const viewport=window.visualViewport;
      const vw=viewport?.width??document.documentElement.clientWidth;
      const vh=viewport?.height??window.innerHeight;
      const leftOffset=viewport?.offsetLeft??0;
      const topOffset=viewport?.offsetTop??0;
      const xy=placeOffsetMenu({
        anchor:{x:anchor.x-leftOffset,y:anchor.y-topOffset},
        width:element.offsetWidth,height:element.offsetHeight,
        viewportWidth:vw,viewportHeight:vh,margin:8,gap:8,
      });
      setPosition({left:xy.left+leftOffset,top:xy.top+topOffset});
    };
    measure();
    window.addEventListener("resize",measure);
    window.visualViewport?.addEventListener("resize",measure);
    return()=>{
      window.removeEventListener("resize",measure);
      window.visualViewport?.removeEventListener("resize",measure);
    };
  },[anchor.x,anchor.y]);
  useEffect(()=>{
    const onKeyDown=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();onClose();}};
    const onPointerDown=(e:PointerEvent)=>{
      if(!ref.current?.contains(e.target as Node))onClose();
    };
    const onScroll=(e:Event)=>{
      if(ref.current?.contains(e.target as Node))return;
      onClose();
    };
    document.addEventListener("keydown",onKeyDown);
    document.addEventListener("pointerdown",onPointerDown,true);
    document.addEventListener("scroll",onScroll,true);
    return()=>{
      document.removeEventListener("keydown",onKeyDown);
      document.removeEventListener("pointerdown",onPointerDown,true);
      document.removeEventListener("scroll",onScroll,true);
    };
  },[onClose]);
  if(typeof document==="undefined")return null;
  return createPortal(
    <div ref={ref} role="menu" aria-label={label}
      className="fixed z-[120] w-[min(13rem,calc(100vw-1rem))] max-h-[min(70dvh,420px)] overflow-y-auto rounded-xl border border-noema-border bg-[#1c1d20] p-1.5 text-neutral-100 shadow-2xl"
      style={{left:position?.left??0,top:position?.top??0,visibility:position?"visible":"hidden"}}>
      {children}
    </div>, document.body);
}
