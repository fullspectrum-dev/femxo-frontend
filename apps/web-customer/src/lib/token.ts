/**
 * The access token, in memory only: never localStorage or a cookie, so page
 * script can't leave it lying around (ADR 0005). A reload loses it, and the
 * httpOnly refresh cookie gets a new one.
 */
let accessToken: string | undefined;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | undefined) => {
  accessToken = token;
};
