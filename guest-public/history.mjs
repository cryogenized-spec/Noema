/** Merge encrypted history pages by immutable server sequence.
 * Older loads and the foreground poll can complete in either order.
 */
export function mergeMessagePages(existing,incoming){
  const merged=new Map();
  for(const message of existing)if(Number.isSafeInteger(message.seq)&&message.seq>0)
    merged.set(message.seq,message);
  for(const message of incoming)if(Number.isSafeInteger(message.seq)&&message.seq>0)
    merged.set(message.seq,message);
  return [...merged.values()].sort((a,b)=>a.seq-b.seq);
}
