"""Minimal, explicit OIDC client. Deliberately plain: httpx for the protocol
calls, PyJWT for JWKS verification. No client secret - the app is a PKCE
public client and the code exchange happens server-side, so the verifier never
leaves this process."""

from dataclasses import dataclass, field
from urllib.parse import urlencode

import httpx
import jwt

SCOPE = "openid profile email"

# The IdP's clock is never exactly ours: a token minted "now" can arrive with
# an iat a second or two in the future and would otherwise fail validation.
CLOCK_SKEW_SECONDS = 60


class ZitadelError(RuntimeError):
    pass


@dataclass
class ZitadelClient:
    issuer: str
    client_id: str
    http: httpx.Client
    jwks: dict | None = None  # test seam: skip fetching the key set
    _discovery: dict | None = field(default=None, init=False, repr=False)

    def discovery(self) -> dict:
        if self._discovery is None:
            url = f"{self.issuer.rstrip('/')}/.well-known/openid-configuration"
            response = self.http.get(url)
            response.raise_for_status()
            self._discovery = dict(response.json())
        return self._discovery

    def authorize_url(
        self,
        *,
        state: str,
        nonce: str,
        code_challenge: str,
        redirect_uri: str,
        login_hint: str | None = None,
        prompt: str | None = None,
    ) -> str:
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "scope": SCOPE,
            "redirect_uri": redirect_uri,
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        # login_hint prefills the hosted email box; prompt=create opens the
        # registration form directly. Both are optional conveniences only.
        if login_hint:
            params["login_hint"] = login_hint
        if prompt:
            params["prompt"] = prompt
        return f"{self.discovery()['authorization_endpoint']}?{urlencode(params)}"

    def exchange_code(self, *, code: str, code_verifier: str, redirect_uri: str) -> dict:
        payload = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": self.client_id,
            "code_verifier": code_verifier,
        }
        response = self.http.post(self.discovery()["token_endpoint"], data=payload)
        if response.status_code >= 400:
            raise ZitadelError(f"token exchange failed ({response.status_code}): {response.text}")
        return response.json()

    def verify_id_token(self, id_token: str, *, nonce: str) -> dict:
        key_set = self.jwks if self.jwks is not None else self._fetch_jwks()
        try:
            kid = jwt.get_unverified_header(id_token).get("kid")
        except jwt.PyJWTError as exc:
            raise ZitadelError(f"malformed id_token: {exc}") from exc
        try:
            parsed = jwt.PyJWKSet.from_dict(key_set)
            key = parsed[kid] if kid else parsed.keys[0]
        except (jwt.PyJWTError, KeyError, IndexError) as exc:
            raise ZitadelError(f"unknown signing key: {exc}") from exc

        algorithms = self.discovery().get("id_token_signing_alg_values_supported") or ["RS256"]
        try:
            claims = jwt.decode(
                id_token,
                key.key,
                algorithms=[alg for alg in algorithms if alg != "none"],
                audience=self.client_id,
                issuer=self.issuer.rstrip("/"),
                options={"require": ["exp", "iat", "sub", "aud", "iss"]},
                leeway=CLOCK_SKEW_SECONDS,
            )
        except jwt.PyJWTError as exc:
            raise ZitadelError(f"id_token rejected: {exc}") from exc
        if claims.get("nonce") != nonce:
            raise ZitadelError("nonce mismatch")
        return claims

    def end_session_url(
        self, *, id_token_hint: str | None = None, post_logout_redirect_uri: str | None = None
    ) -> str:
        endpoint = self.discovery()["end_session_endpoint"]
        params = {"client_id": self.client_id}
        if id_token_hint:
            params["id_token_hint"] = id_token_hint
        if post_logout_redirect_uri:
            params["post_logout_redirect_uri"] = post_logout_redirect_uri
        return f"{endpoint}?{urlencode(params)}"

    def _fetch_jwks(self) -> dict:
        response = self.http.get(self.discovery()["jwks_uri"])
        response.raise_for_status()
        return response.json()
