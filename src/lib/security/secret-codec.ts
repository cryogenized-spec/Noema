export interface SecretCodec {
  encode: (value: string) => Promise<string>;
  decode: (value: string) => Promise<string>;
  strategy: "plain" | "webcrypto";
}

class PlainTextCodec implements SecretCodec {
  strategy = "plain" as const;

  async encode(value: string): Promise<string> {
    return value;
  }

  async decode(value: string): Promise<string> {
    return value;
  }
}

// Extension point: add passphrase-driven WebCrypto codec in a later hardening pass.
export const secretCodec: SecretCodec = new PlainTextCodec();
