const btoa = (s) => Buffer.from(s).toString('base64');
const atob = (s) => Buffer.from(s, 'base64').toString();

const token = '{"name": "Angelo Failla 😉"}';
const encoded = btoa(unescape(encodeURIComponent(token)));
console.log(encoded);
const decoded = decodeURIComponent(escape(atob(encoded)));
console.log(decoded);
