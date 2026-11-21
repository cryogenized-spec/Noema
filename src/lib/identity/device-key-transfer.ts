/** Experimental, disabled-by-default per-device key provisioning.
 * Uses WebCrypto P-256 ECDH, HKDF-SHA256 and AES-256-GCM plus the existing
 * ECDSA device identity. This is NOT a ratchet, backup or audited E2EE protocol.
 * No browser persistence or network calls happen in this module.
 */
const encoder=new TextEncoder();
const ID=/^[A-Za-z0-9_-]{12,90}$/;
const KEY=/^[A-Za-z0-9_-]{43}$/;
const toBuffer=(value:Uint8Array):ArrayBuffer=>{
  const target=new ArrayBuffer(value.byteLength);
  new Uint8Array(target).set(value);
  return target;
};
const utf8=(value:string)=>encoder.encode(value);
const encode=(bytes:Uint8Array)=>{
  let out="";for(const byte of bytes)out+=String.fromCharCode(byte);
  return btoa(out).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
};
const decode=(value:string):Uint8Array=>{
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error("Invalid key encoding.");
  const b=atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4));
  return Uint8Array.from(b,ch=>ch.charCodeAt(0));
};
export type SigningCallback=(data:Uint8Array<ArrayBuffer>)=>Promise<ArrayBuffer>;
export interface TransferOffer {
  version:1;
  accountId:string;requestId:string;candidateDeviceId:string;
  publicJwk:JsonWebKey;createdAt:string;expiresAt:string;signature:string;
}
export interface TransferPackage {
  version:1;accountId:string;requestId:string;
  ownerDeviceId:string;recipientDeviceId:string;
  offerHash:string;ephemeralPublicJwk:JsonWebKey;
  salt:string;nonce:string;ciphertext:string;
  createdAt:string;expiresAt:string;signature:string;
}
const validP256=(jwk:JsonWebKey):boolean=>
  !!jwk && jwk.kty==="EC" && jwk.crv==="P-256" &&
  typeof jwk.x==="string" && KEY.test(jwk.x) &&
  typeof jwk.y==="string" && KEY.test(jwk.y) &&
  !("d" in jwk);
const p256=(jwk:JsonWebKey):JsonWebKey=>{
  if(!validP256(jwk))throw Error("Expected an unprivileged P-256 public key.");
  return {kty:"EC",crv:"P-256",x:jwk.x,y:jwk.y};
};
const offerFields=(o:TransferOffer)=>[
  o.version,o.accountId,o.requestId,o.candidateDeviceId,
  o.publicJwk.x,o.publicJwk.y,o.createdAt,o.expiresAt,
];
const transferFields=(p:TransferPackage)=>[
  p.version,p.accountId,p.requestId,p.ownerDeviceId,p.recipientDeviceId,
  p.offerHash,p.ephemeralPublicJwk.x,p.ephemeralPublicJwk.y,
  p.salt,p.nonce,p.ciphertext,p.createdAt,p.expiresAt,
];
export const transferOfferBytes=(o:TransferOffer):Uint8Array<ArrayBuffer>=>
  utf8("NOEMA_DEVICE_KEY_OFFER_V1\n"+JSON.stringify(offerFields(o)));
export const signedTransferBytes=(p:TransferPackage):Uint8Array<ArrayBuffer>=>
  utf8("NOEMA_ACCOUNT_KEY_PACKAGE_V1\n"+JSON.stringify(transferFields(p)));
async function fingerprint(jwk:JsonWebKey):Promise<string>{
  const clean=p256(jwk);
  const bytes=await crypto.subtle.digest("SHA-256",toBuffer(
    utf8(JSON.stringify(["NOEMA_DEVICE_V1",clean.x,clean.y]))));
  return encode(new Uint8Array(bytes));
}
const isCurrent=(created:string,expires:string,now:number):boolean=>{
  const c=Date.parse(created),e=Date.parse(expires);
  return Number.isFinite(c)&&Number.isFinite(e) &&
    c<=now+30_000 && now<e && e>c &&
    e-c<=10*60_000;
};
export async function createRecipientOffer(
  accountId:string,requestId:string,candidateDeviceId:string,
  sign:SigningCallback,now=Date.now(),
):Promise<{offer:TransferOffer;privateKey:CryptoKey}>{
  if(![accountId,requestId,candidateDeviceId].every(x=>ID.test(x)))
    throw Error("Invalid account or signed device.");
  const pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]);
  const publicJwk=p256(await crypto.subtle.exportKey("jwk",pair.publicKey));
  const offer:TransferOffer={version:1,accountId,requestId,candidateDeviceId,publicJwk,
    createdAt:new Date(now).toISOString(),expiresAt:new Date(now+5*60_000).toISOString(),
    signature:""};
  offer.signature=encode(new Uint8Array(await sign(transferOfferBytes(offer))));
  return {offer,privateKey:pair.privateKey};
}
export async function verifyRecipientOffer(
  offer:TransferOffer,knownCandidateSigningKey:JsonWebKey,
  expected:{accountId:string;requestId:string;deviceId:string},now=Date.now(),
):Promise<void>{
  if(!offer||offer.version!==1||!validP256(offer.publicJwk) ||
    !isCurrent(offer.createdAt,offer.expiresAt,now) ||
    offer.accountId!==expected.accountId||offer.requestId!==expected.requestId ||
    offer.candidateDeviceId!==expected.deviceId ||
    !/^[A-Za-z0-9_-]{80,100}$/.test(offer.signature) ||
    await fingerprint(knownCandidateSigningKey)!==expected.deviceId)
    throw Error("Candidate's signed device offer is not verified.");
  const signer=await crypto.subtle.importKey("jwk",p256(knownCandidateSigningKey),
    {name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
  if(!await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},signer,
    toBuffer(decode(offer.signature)),toBuffer(transferOfferBytes(offer))))
    throw Error("Candidate exchange key signature is invalid.");
}
export async function transferOfferHash(offer:TransferOffer):Promise<string>{
  return encode(new Uint8Array(await crypto.subtle.digest("SHA-256",
    toBuffer(utf8(JSON.stringify([...offerFields(offer),offer.signature]))))));
}
const aad=(p:TransferPackage)=>utf8(JSON.stringify([
  "NOEMA_ACCOUNT_KEY_TRANSFER_V1",p.accountId,p.requestId,p.ownerDeviceId,
  p.recipientDeviceId,p.offerHash,p.ephemeralPublicJwk.x,p.ephemeralPublicJwk.y,
  p.createdAt,p.expiresAt,
]));
const deriveWrapKey=async(
  privateKey:CryptoKey,publicJwk:JsonWebKey,p:TransferPackage,
):Promise<CryptoKey>=>{
  const peer=await crypto.subtle.importKey("jwk",p256(publicJwk),
    {name:"ECDH",namedCurve:"P-256"},false,[]);
  const shared=await crypto.subtle.deriveBits({name:"ECDH",public:peer},privateKey,256);
  const material=await crypto.subtle.importKey("raw",shared,"HKDF",false,["deriveKey"]);
  return crypto.subtle.deriveKey({
    name:"HKDF",hash:"SHA-256",salt:toBuffer(decode(p.salt)),
    info:toBuffer(aad(p)),
  },material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
};
export async function sealAccountRootForRecipient(
  root:Uint8Array,offer:TransferOffer,candidateSigningKey:JsonWebKey,
  ownerDeviceId:string,signOwner:SigningCallback,now=Date.now(),
):Promise<TransferPackage>{
  if(root.byteLength!==32 || !ID.test(ownerDeviceId))
    throw Error("A new 256-bit account root and owner identity are required.");
  await verifyRecipientOffer(offer,candidateSigningKey,{
    accountId:offer.accountId,requestId:offer.requestId,deviceId:offer.candidateDeviceId,
  },now);
  const ephemeral=await crypto.subtle.generateKey(
    {name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]);
  const pub=p256(await crypto.subtle.exportKey("jwk",ephemeral.publicKey));
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const pkg:TransferPackage={version:1,accountId:offer.accountId,requestId:offer.requestId,
    ownerDeviceId,recipientDeviceId:offer.candidateDeviceId,
    offerHash:await transferOfferHash(offer),ephemeralPublicJwk:pub,
    salt:encode(salt),nonce:encode(nonce),ciphertext:"",
    createdAt:new Date(now).toISOString(),
    expiresAt:new Date(Math.min(now+5*60_000,Date.parse(offer.expiresAt))).toISOString(),
    signature:""};
  const wrapping=await deriveWrapKey(ephemeral.privateKey,offer.publicJwk,pkg);
  pkg.ciphertext=encode(new Uint8Array(await crypto.subtle.encrypt({
    name:"AES-GCM",iv:toBuffer(nonce),additionalData:toBuffer(aad(pkg)),tagLength:128,
  },wrapping,toBuffer(root))));
  pkg.signature=encode(new Uint8Array(await signOwner(signedTransferBytes(pkg))));
  return pkg;
}
/** Verifies owner ECDSA signature before AES-GCM decryption. The caller must
 * pin the owner fingerprint out of band and enforce durable one-time claim.
 * The returned HKDF root is non-extractable; original key seed is never given
 * back to the app as a base64 string.
 */
export async function openAccountRootFromOwner(
  pkg:TransferPackage,offer:TransferOffer,recipientPrivateKey:CryptoKey,
  trustedOwnerSigningJwk:JsonWebKey,
  expected:{accountId:string;requestId:string;ownerDeviceId:string;recipientDeviceId:string},
  now=Date.now(),
):Promise<CryptoKey>{
  if(!pkg||pkg.version!==1||!validP256(pkg.ephemeralPublicJwk) ||
    !isCurrent(pkg.createdAt,pkg.expiresAt,now) ||
    pkg.accountId!==expected.accountId||pkg.requestId!==expected.requestId ||
    pkg.ownerDeviceId!==expected.ownerDeviceId ||
    pkg.recipientDeviceId!==expected.recipientDeviceId ||
    offer.accountId!==pkg.accountId||offer.requestId!==pkg.requestId||
    offer.candidateDeviceId!==pkg.recipientDeviceId ||
    await transferOfferHash(offer)!==pkg.offerHash ||
    await fingerprint(trustedOwnerSigningJwk)!==expected.ownerDeviceId ||
    !/^[A-Za-z0-9_-]{80,100}$/.test(pkg.signature) ||
    decode(pkg.salt).length!==16||decode(pkg.nonce).length!==12||
    !/^[A-Za-z0-9_-]{40,160}$/.test(pkg.ciphertext))
    throw Error("Device key transfer identity or freshness mismatch.");
  const ownerKey=await crypto.subtle.importKey("jwk",p256(trustedOwnerSigningJwk),
    {name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
  if(!await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},ownerKey,
    toBuffer(decode(pkg.signature)),toBuffer(signedTransferBytes(pkg))))
    throw Error("Account key envelope was not signed by the verified owner.");
  if(recipientPrivateKey.extractable || recipientPrivateKey.algorithm.name!=="ECDH")
    throw Error("Recipient exchange private key is not a protected ECDH key.");
  const wrapping=await deriveWrapKey(recipientPrivateKey,pkg.ephemeralPublicJwk,pkg);
  const plain=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",
    iv:toBuffer(decode(pkg.nonce)),additionalData:toBuffer(aad(pkg)),tagLength:128,
  },wrapping,toBuffer(decode(pkg.ciphertext))));
  if(plain.length!==32)throw Error("Account key envelope has an invalid payload.");
  try{return await crypto.subtle.importKey("raw",toBuffer(plain),"HKDF",false,["deriveKey"]);}
  finally{plain.fill(0);}
}
