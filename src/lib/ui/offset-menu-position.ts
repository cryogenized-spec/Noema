/** RADIX-inspired offset positioning with strict viewport collision bounds. */
export type MenuAnchor = {x:number;y:number};
export type MenuGeometry = {
  anchor:MenuAnchor; width:number; height:number; viewportWidth:number; viewportHeight:number;
  margin?:number;gap?:number;
};
export function placeOffsetMenu({anchor,width,height,viewportWidth,viewportHeight,margin=8,gap=8}:MenuGeometry){
  const availableWidth=Math.max(0,viewportWidth-2*margin);
  const availableHeight=Math.max(0,viewportHeight-2*margin);
  const w=Math.min(Math.max(0,width),availableWidth);
  const h=Math.min(Math.max(0,height),availableHeight);
  const left=anchor.x+gap+w<=viewportWidth-margin?anchor.x+gap:anchor.x-w-gap;
  const top=anchor.y+gap+h<=viewportHeight-margin?anchor.y+gap:anchor.y-h-gap;
  return {
    left:Math.min(Math.max(margin,left),Math.max(margin,viewportWidth-margin-w)),
    top:Math.min(Math.max(margin,top),Math.max(margin,viewportHeight-margin-h)),
  };
}
