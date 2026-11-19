/** Merge a received encrypted-message page by immutable server sequence.
 * Paging can race a foreground poll. Ordering must not depend on arrival order.
 */
export interface SequencedMessage {seq:number}
export function mergeMessagePages<T extends SequencedMessage>(
  already:ReadonlyArray<T>, incoming:ReadonlyArray<T>,
):T[]{
  const bySequence=new Map<number,T>();
  for(const item of already)if(Number.isSafeInteger(item.seq)&&item.seq>0)bySequence.set(item.seq,item);
  for(const item of incoming)if(Number.isSafeInteger(item.seq)&&item.seq>0)bySequence.set(item.seq,item);
  return [...bySequence.values()].sort((a,b)=>a.seq-b.seq);
}
