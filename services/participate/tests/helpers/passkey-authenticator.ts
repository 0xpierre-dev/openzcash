import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

// Test-only authenticator. Real ES256 signatures; no user/device credentials.
export function testAuthenticator() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const credentialBytes = randomBytes(32);
  const credentialId = credentialBytes.toString("base64url");
  const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([
    [1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x!, "base64url"))], [-3, new Uint8Array(Buffer.from(jwk.y!, "base64url"))]
  ]));
  const hash = (input: string | Uint8Array) => createHash("sha256").update(input).digest();
  function client(type: string, challenge: string, origin: string, crossOrigin = false) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin }));
  }
  function authData(rpId: string, flags: number, counter: number) {
    const count = Buffer.alloc(4); count.writeUInt32BE(counter);
    return Buffer.concat([hash(rpId), Buffer.from([flags]), count]);
  }
  return {
    credentialId,
    registration(challenge: string, { origin = "http://localhost:4411", rpId = "localhost", verified = true, crossOrigin = false } = {}): RegistrationResponseJSON {
      const length = Buffer.alloc(2); length.writeUInt16BE(credentialBytes.length);
      const data = Buffer.concat([authData(rpId, verified ? 0x45 : 0x41, 0), Buffer.alloc(16), length, credentialBytes, cose]);
      const attestation = isoCBOR.encode(new Map<string, string | Map<string, string> | Uint8Array>([
        ["fmt", "none"], ["attStmt", new Map()], ["authData", new Uint8Array(data)]
      ]));
      return { id: credentialId, rawId: credentialId, type: "public-key", clientExtensionResults: {}, response: {
        attestationObject: Buffer.from(attestation).toString("base64url"), clientDataJSON: client("webauthn.create", challenge, origin, crossOrigin).toString("base64url"), transports: ["internal"]
      } };
    },
    authentication(challenge: string, userHandle: string, { origin = "http://localhost:4411", rpId = "localhost", counter = 1, verified = true, crossOrigin = false } = {}): AuthenticationResponseJSON {
      const data = authData(rpId, verified ? 0x05 : 0x01, counter);
      const json = client("webauthn.get", challenge, origin, crossOrigin);
      return { id: credentialId, rawId: credentialId, type: "public-key", clientExtensionResults: {}, response: {
        clientDataJSON: json.toString("base64url"), authenticatorData: data.toString("base64url"),
        signature: sign("sha256", Buffer.concat([data, hash(json)]), privateKey).toString("base64url"), userHandle
      } };
    }
  };
}
