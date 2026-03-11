const tokens = '{"name": "Angelo Failla 😉"}';

// Encode
const bytes = new TextEncoder().encode(tokens);
const binString = Array.from(bytes).map((b) => String.fromCodePoint(b)).join("");
const encoded = btoa(binString);
console.log("Encoded:", encoded);

// Decode
const decodedBinString = atob(encoded);
const decodedBytes = new Uint8Array(decodedBinString.length);
for (let i = 0; i < decodedBinString.length; i++) {
  decodedBytes[i] = decodedBinString.charCodeAt(i);
}
const decodedString = new TextDecoder().decode(decodedBytes);
console.log("Decoded:", decodedString);
