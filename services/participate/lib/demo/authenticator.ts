import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

// Server-side ES256 authenticator for the demo TEST seats only. The ballots it
// produces go through the same WebAuthn verification as a browser passkey.
const sha256 = (input: string | Uint8Array) =>
  createHash("sha256").update(input).digest();

export function createSeatKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const jwk = publicKey.export({ format: "jwk" });
  const cose = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, new Uint8Array(Buffer.from(jwk.x!, "base64url"))],
      [-3, new Uint8Array(Buffer.from(jwk.y!, "base64url"))],
    ]),
  );
  return {
    credentialId: randomBytes(32).toString("base64url"),
    userHandle: randomBytes(16).toString("base64url"),
    publicKey: Buffer.from(cose),
    privateKey: privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
  };
}

type Assertion = {
  credentialId: string;
  userHandle: string;
  privateKey: string;
  challenge: string;
  origin: string;
  rpId: string;
  counter: number;
};

export function seatAssertion({
  credentialId,
  userHandle,
  privateKey,
  challenge,
  origin,
  rpId,
  counter,
}: Assertion): AuthenticationResponseJSON {
  const count = Buffer.alloc(4);
  count.writeUInt32BE(counter);
  // Flags: user present (0x01) + user verified (0x04).
  const authenticatorData = Buffer.concat([
    sha256(rpId),
    Buffer.from([0x05]),
    count,
  ]);
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge,
      origin,
      crossOrigin: false,
    }),
  );
  const key = createPrivateKey({
    key: Buffer.from(privateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const signature = sign(
    "sha256",
    Buffer.concat([authenticatorData, sha256(clientDataJSON)]),
    key,
  );
  return {
    id: credentialId,
    rawId: credentialId,
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: clientDataJSON.toString("base64url"),
      authenticatorData: authenticatorData.toString("base64url"),
      signature: signature.toString("base64url"),
      userHandle,
    },
  };
}
